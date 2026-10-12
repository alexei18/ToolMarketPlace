import type { ApiErrorBody, ErrorCode } from "@tm/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodError } from "zod";

const STATUS: Partial<Record<ErrorCode, ContentfulStatusCode>> = {
  VALIDATION: 400,
  INVALID_URL: 400,
  UNAUTHORIZED: 401,
  SIGNUP_REQUIRED: 401,
  FORBIDDEN: 403,
  BANNED: 403,
  EMAIL_NOT_VERIFIED: 403,
  TURNSTILE_FAILED: 403,
  BLOCKED_DOMAIN: 403,
  DOMAIN_NOT_VERIFIED: 403,
  FEEDBACK_DISABLED: 403,
  ROADMAP_DISABLED: 403,
  NOT_FOUND: 404,
  DUPLICATE_URL: 409,
  DOMAIN_TAKEN: 409,
  ALREADY_CLAIMED: 409,
  ALREADY_REPORTED: 409,
  USERNAME_TAKEN: 409,
  PERK_UNAVAILABLE: 410,
  VERIFICATION_FAILED: 422,
  FETCH_FAILED: 422,
  RATE_LIMITED: 429,
  LIMIT_REACHED: 429,
  INTERNAL: 500,
};

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public extra: { existing?: string; fields?: Record<string, string[]> } = {},
  ) {
    super(message);
  }

  get status(): ContentfulStatusCode {
    return STATUS[this.code] ?? 400;
  }

  toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message, ...this.extra } };
  }
}

export const notFound = (what = "Not found") => new ApiError("NOT_FOUND", what);

type Issue = ZodError["issues"][number];

/** A sentence a person can act on, instead of Zod's wording ("Too small: expected string to have >=1 characters"). */
function issueMessage(issue: Issue): string {
  const i = issue as Issue & { origin?: string; minimum?: number | bigint; maximum?: number | bigint; format?: string };
  switch (i.code) {
    case "too_small":
      if (i.origin === "string") return Number(i.minimum) <= 1 ? "This can't be empty" : `Use at least ${i.minimum} characters`;
      if (i.origin === "array" || i.origin === "set") return Number(i.minimum) <= 1 ? "Pick at least one" : `Pick at least ${i.minimum}`;
      return `Must be at least ${i.minimum}`;
    case "too_big":
      if (i.origin === "string") return `Use at most ${i.maximum} characters`;
      if (i.origin === "array" || i.origin === "set") return `Pick at most ${i.maximum}`;
      return `Must be at most ${i.maximum}`;
    case "invalid_format":
      return i.format === "url" ? "Enter a full link, like https://example.com" : i.format === "email" ? "Enter a valid email address" : "This doesn't look right";
    case "invalid_type":
      return /received (undefined|null)$/.test(i.message) ? "This is required" : "This doesn't look right";
    case "custom":
      return i.message;
    default:
      return "This doesn't look right";
  }
}

/** "sharedCode" -> "Shared code", for the one-line summary of the first problem. */
function fieldLabel(path: Issue["path"]): string {
  const name = [...path].reverse().find((p): p is string => typeof p === "string");
  if (!name) return "";
  const words = name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
  return `${words[0]!.toUpperCase()}${words.slice(1)}: `;
}

export function zodToApiError(err: ZodError): ApiError {
  const fields: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    (fields[key] ??= []).push(issueMessage(issue));
  }
  const first = err.issues[0];
  return new ApiError("VALIDATION", first ? `${fieldLabel(first.path)}${issueMessage(first)}` : "Invalid input", { fields });
}

export function errorResponse(c: Context, err: unknown) {
  if (err instanceof ApiError) return c.json(err.toBody(), err.status);
  console.error("Unhandled error", err);
  return c.json({ error: { code: "INTERNAL", message: "Something went wrong" } } satisfies ApiErrorBody, 500);
}
