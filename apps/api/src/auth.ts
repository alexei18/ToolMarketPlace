import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { captcha } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { schema, user as userTable, type Database } from "@tm/db";
import { newId } from "@tm/shared";
import type { Env } from "./env";
import { sendEmail } from "./lib/email";
import { hashPassword, verifyPassword } from "./lib/password";
import { uniqueUsername } from "./lib/username";

export function createAuth(env: Env, db: Database) {
  const secure = env.API_ORIGIN.startsWith("https://");
  const webOrigin = env.WEB_ORIGIN.replace(/\/$/, "");

  return betterAuth({
    appName: env.SITE_NAME,
    baseURL: env.API_ORIGIN,
    basePath: "/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [webOrigin],
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    telemetry: { enabled: false },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
      password: { hash: hashPassword, verify: verifyPassword },
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(env, {
          to: user.email,
          subject: `Reset your ${env.SITE_NAME} password`,
          lines: ["Someone asked to reset the password for this account. If it was you, use the link below. It expires in one hour.", "If you didn't ask for this, ignore this email."],
          action: { label: "Reset password", url },
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail(env, {
          to: user.email,
          subject: `Confirm your email for ${env.SITE_NAME}`,
          lines: [`Welcome to ${env.SITE_NAME}. Confirm your email to claim perks, publish products and report listings.`],
          action: { label: "Confirm email", url },
        });
      },
    },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, prompt: "select_account" } }
        : {},
    account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
    user: {
      additionalFields: {
        username: { type: "string", required: false, input: false },
        bio: { type: "string", required: false, input: false },
        role: { type: "string", required: false, input: false, defaultValue: "user" },
        bannedAt: { type: "number", required: false, input: false },
        digestFrequency: { type: "string", required: false, input: false, defaultValue: "weekly" },
        onboardedAt: { type: "number", required: false, input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    advanced: {
      useSecureCookies: secure,
      defaultCookieAttributes: { sameSite: "lax", httpOnly: true, secure },
      crossSubDomainCookies: env.COOKIE_DOMAIN ? { enabled: true, domain: env.COOKIE_DOMAIN } : undefined,
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] },
      database: { generateId: () => newId() },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (data) => {
            const base = (data.name || data.email.split("@")[0] || "user").toString();
            return { data: { ...data, username: await uniqueUsername(db, base) } };
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const row = await db.select({ bannedAt: userTable.bannedAt }).from(userTable).where(eq(userTable.id, session.userId)).get();
            if (row?.bannedAt) throw new APIError("FORBIDDEN", { message: "This account has been suspended." });
          },
        },
      },
    },
    plugins: env.TURNSTILE_SECRET_KEY
      ? [captcha({ provider: "cloudflare-turnstile", secretKey: env.TURNSTILE_SECRET_KEY, endpoints: ["/sign-up/email"] })]
      : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;
