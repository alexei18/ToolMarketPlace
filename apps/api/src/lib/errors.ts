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

export function zodToApiError(err: ZodError): ApiError {
  const fields: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    (fields[key] ??= []).push(issue.message);
  }
  const first = err.issues[0];
  const where = first?.path.length ? `${first.path.join(".")}: ` : "";
  return new ApiError("VALIDATION", `${where}${first?.message ?? "Invalid input"}`, { fields });
}

export function errorResponse(c: Context, err: unknown) {
  if (err instanceof ApiError) return c.json(err.toBody(), err.status);
  console.error("Unhandled error", err);
  return c.json({ error: { code: "INTERNAL", message: "Something went wrong" } } satisfies ApiErrorBody, 500);
}
