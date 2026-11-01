import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv, Env } from "./env";
import { ApiError, errorResponse } from "./lib/errors";
import { IMAGE_KEY_RE } from "./lib/images";
import { context, originCheck, rateLimit } from "./middleware";
import admin from "./routes/admin";
import interact from "./routes/interact";
import maker from "./routes/maker";
import me from "./routes/me";
import publicRoutes from "./routes/public";
import waitlist from "./routes/waitlist";

/** Name of the non-HttpOnly cookie that only tells the web app "a session probably exists". */
export const AUTH_HINT_COOKIE = "tm_auth";

/**
 * Mirrors Better Auth's session cookie into a readable hint cookie (no secret in it), so cached
 * pages can decide in the browser whether to load personal data at all, and the web app can
 * redirect signed-in visitors from / to /feed without a database lookup.
 */
export function withAuthHint(res: Response, env: Env): Response {
  const cookies = res.headers.getSetCookie?.() ?? [];
  const sessionCookie = cookies.find((c) => /^(?:__Secure-)?better-auth\.session_token=/.test(c));
  if (!sessionCookie) return res;
  const cleared = /^[^=]+=;|max-age=0/i.test(sessionCookie);
  const out = new Response(res.body, res);
  const attrs = [`Path=/`, `SameSite=Lax`];
  if (env.API_ORIGIN.startsWith("https://")) attrs.push("Secure");
  if (env.COOKIE_DOMAIN) attrs.push(`Domain=${env.COOKIE_DOMAIN}`);
  out.headers.append("Set-Cookie", cleared ? `${AUTH_HINT_COOKIE}=; Max-Age=0; ${attrs.join("; ")}` : `${AUTH_HINT_COOKIE}=1; Max-Age=${60 * 60 * 24 * 30}; ${attrs.join("; ")}`);
  return out;
}

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use("*", secureHeaders({ crossOriginResourcePolicy: "cross-origin" }));
  app.use("*", async (c, next) => {
    const allowed = [c.env.WEB_ORIGIN.replace(/\/$/, "")];
    return cors({
      origin: (origin) => (allowed.includes(origin) ? origin : null),
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "x-captcha-response"],
      maxAge: 600,
    })(c, next);
  });

  app.onError((err, c) => errorResponse(c, err));
  app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404));

  app.get("/", (c) => c.json({ name: `${c.env.SITE_NAME} API`, ok: true }));
  app.get("/health", (c) => c.json({ ok: true }));
  // The API lives on its own subdomain, so the site's robots.txt doesn't cover it. Card and product
  // images stay fetchable: Twitterbot drops images that robots.txt disallows.
  app.get("/robots.txt", (c) =>
    c.text("User-agent: *\nAllow: /og/\nAllow: /img/\nDisallow: /\n", 200, { "Cache-Control": "public, max-age=86400" }),
  );

  /** Product images from R2 (fallback when no img. custom domain is configured). */
  app.get("/img/:file", async (c) => {
    const key = `img/${c.req.param("file")}`;
    if (!IMAGE_KEY_RE.test(key)) throw new ApiError("NOT_FOUND", "Not found");
    const obj = await c.env.IMAGES_BUCKET.get(key, { onlyIf: c.req.raw.headers });
    if (!obj) throw new ApiError("NOT_FOUND", "Not found");
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("etag", obj.httpEtag);
    headers.set("cache-control", "public, max-age=31536000, immutable");
    if (!("body" in obj) || !obj.body) return new Response(null, { status: 304, headers });
    return new Response(obj.body, { headers });
  });

  app.use("*", context);
  app.use("*", rateLimit);
  app.use("*", originCheck);

  // Magic links are minted only by the API itself (the maker invite, routes/waitlist.ts), never on request.
  app.post("/auth/sign-in/magic-link", () => {
    throw new ApiError("NOT_FOUND", "Not found");
  });
  app.on(["GET", "POST"], "/auth/*", async (c) => withAuthHint(await c.get("auth").handler(c.req.raw), c.env));

  app.route("/", publicRoutes);
  app.route("/", me);
  app.route("/", interact);
  app.route("/", maker);
  app.route("/", admin);
  app.route("/", waitlist);
  return app;
}
