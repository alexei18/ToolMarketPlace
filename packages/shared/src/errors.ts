export const ERROR_CODES = [
  "VALIDATION",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "BANNED",
  "RATE_LIMITED",
  "TURNSTILE_FAILED",
  "EMAIL_NOT_VERIFIED",
  "INVALID_URL",
  "DUPLICATE_URL",
  "BLOCKED_DOMAIN",
  "DOMAIN_NOT_VERIFIED",
  "DOMAIN_TAKEN",
  "VERIFICATION_FAILED",
  "FETCH_FAILED",
  "LIMIT_REACHED",
  "ALREADY_CLAIMED",
  "PERK_UNAVAILABLE",
  "FEEDBACK_DISABLED",
  "ROADMAP_DISABLED",
  "ALREADY_REPORTED",
  "CONTEST_CLOSED",
  "USERNAME_TAKEN",
  "SIGNUP_REQUIRED",
  "GONE",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    /** Link to an existing resource, e.g. the listing that already uses a URL. */
    existing?: string;
    fields?: Record<string, string[]>;
    /** GONE: the category a hidden or removed product was listed in. */
    category?: { slug: string; name: string };
  };
}
