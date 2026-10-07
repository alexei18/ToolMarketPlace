import { and, eq, isNotNull } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { createDb, domains, type Database } from "@tm/db";
import { resolveLimits } from "@tm/shared";
import { createAuth, type Auth } from "./auth";
import type { AppEnv, Env, SessionUser } from "./env";
import { ApiError } from "./lib/errors";

const cache = new WeakMap<D1Database, { db: Database; auth: Auth }>();

/** One Drizzle client and Better Auth instance per D1 binding, reused across requests in an isolate. */
export function services(env: Env): { db: Database; auth: Auth } {
  let entry = cache.get(env.DB);
  if (!entry) {
    const db = createDb(env.DB);
    entry = { db, auth: createAuth(env, db) };
    cache.set(env.DB, entry);
  }
  return entry;
}

export const SESSION_COOKIE_RE = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/;

export const context: MiddlewareHandler<AppEnv> = async (c, next) => {
  const { db, auth } = services(c.env);
  c.set("db", db);
  c.set("auth", auth);
  c.set("limits", resolveLimits(c.env));
  c.set("user", null);
  c.set("sessionId", null);

  const cookie = c.req.header("cookie") ?? "";
  if (SESSION_COOKIE_RE.test(cookie) && !c.req.path.startsWith("/auth/")) {
    const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
    if (session) {
      const u = session.user as unknown as SessionUser;
      const admins = (c.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      const role = u.role === "admin" || (u.emailVerified && admins.includes(u.email.toLowerCase())) ? "admin" : "user";
      c.set("user", { ...u, role, bannedAt: u.bannedAt ?? null, onboardedAt: u.onboardedAt ?? null, username: u.username ?? null, bio: u.bio ?? null, image: u.image ?? null, digestFrequency: u.digestFrequency ?? "weekly" });
      c.set("sessionId", session.session.id);
    }
  }
  await next();
};

export function clientIp(c: Context): string | null {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** 60 requests/minute per IP for visitors, 300/minute per account (Cloudflare Rate Limiting binding). */
export const rateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get("user");
  const limiter = user ? c.env.USER_LIMITER : c.env.ANON_LIMITER;
  if (limiter) {
    const key = user ? `u:${user.id}` : `ip:${clientIp(c) ?? "unknown"}`;
    const { success } = await limiter.limit({ key });
    if (!success) throw new ApiError("RATE_LIMITED", "Too many requests. Slow down a little.");
  }
  await next();
};

/**
 * Rejects cross-site state-changing requests: browsers always send Origin on those,
 * and it must be the web app or the API itself.
 */
export const originCheck: MiddlewareHandler<AppEnv> = async (c, next) => {
  const method = c.req.method;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && !c.req.path.startsWith("/auth/")) {
    const origin = c.req.header("origin");
    if (origin && origin !== c.env.WEB_ORIGIN.replace(/\/$/, "") && origin !== c.env.API_ORIGIN.replace(/\/$/, "")) {
      throw new ApiError("FORBIDDEN", "Cross-site request blocked.");
    }
  }
  await next();
};

export function requireUser(c: Context<AppEnv>): SessionUser {
  const user = c.get("user");
  if (!user) throw new ApiError("UNAUTHORIZED", "Sign in to continue.");
  if (user.bannedAt) throw new ApiError("BANNED", "This account has been suspended.");
  return user;
}

export function requireVerifiedUser(c: Context<AppEnv>): SessionUser {
  const user = requireUser(c);
  if (!user.emailVerified) throw new ApiError("EMAIL_NOT_VERIFIED", "Confirm your email address first.");
  return user;
}

export async function isMaker(db: Database, userId: string): Promise<boolean> {
  const row = await db
    .select({ id: domains.id })
    .from(domains)
    .where(and(eq(domains.userId, userId), isNotNull(domains.verifiedAt)))
    .limit(1)
    .get();
  return !!row;
}

export async function requireMaker(c: Context<AppEnv>): Promise<SessionUser> {
  const user = requireUser(c);
  if (user.role === "admin") return user;
  if (!(await isMaker(c.get("db"), user.id))) {
    throw new ApiError("DOMAIN_NOT_VERIFIED", "Verify a domain to become a maker.");
  }
  return user;
}

export function requireAdmin(c: Context<AppEnv>): SessionUser {
  const user = requireUser(c);
  if (user.role !== "admin") throw new ApiError("FORBIDDEN", "Admins only.");
  return user;
}
