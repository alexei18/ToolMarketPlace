import type { Database } from "@tm/db";
import type { Limits } from "@tm/shared";
import type { Auth } from "./auth";

export interface Env {
  DB: D1Database;
  IMAGES_BUCKET: R2Bucket;
  IMAGES?: ImagesBinding;
  ANON_LIMITER?: RateLimit;
  /** Service binding to the site worker (cache purges). */
  WEB?: Fetcher;
  USER_LIMITER?: RateLimit;

  SITE_NAME: string;
  WEB_ORIGIN: string;
  API_ORIGIN: string;
  IMAGES_BASE_URL?: string;
  COOKIE_DOMAIN?: string;
  ADMIN_EMAILS?: string;
  VAPID_SUBJECT?: string;
  VAPID_PUBLIC_KEY?: string;
  EMAIL_FROM?: string;

  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
  /** Shared with the site worker; authorizes /internal/purge. */
  PURGE_SECRET?: string;

  /** Optional overrides for any key of DEFAULT_LIMITS, e.g. VISITOR_CATEGORY_LIMIT=12 */
  [limitOverride: string]: unknown;
}

export interface SessionUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image: string | null;
  createdAt: Date;
  username: string | null;
  bio: string | null;
  role: "user" | "admin";
  bannedAt: number | null;
  digestFrequency: "daily" | "weekly" | "off";
  onboardedAt: number | null;
}

export interface Variables {
  db: Database;
  auth: Auth;
  limits: Limits;
  user: SessionUser | null;
  sessionId: string | null;
}

export type AppEnv = { Bindings: Env; Variables: Variables };
