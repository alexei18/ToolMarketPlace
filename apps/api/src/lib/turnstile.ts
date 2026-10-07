import type { Env } from "../env";
import { ApiError } from "./errors";

/**
 * Verifies a Cloudflare Turnstile token. When no secret is configured (local dev, tests)
 * verification is skipped.
 */
export async function requireTurnstile(env: Env, token: string | undefined, ip: string | null): Promise<void> {
  if (!env.TURNSTILE_SECRET_KEY) return;
  if (!token) throw new ApiError("TURNSTILE_FAILED", "Please complete the anti-bot check.");
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const data = (await res.json()) as { success?: boolean };
    if (data.success) return;
  } catch (err) {
    console.error("[turnstile] verify failed", err);
  }
  throw new ApiError("TURNSTILE_FAILED", "The anti-bot check failed. Please try again.");
}
