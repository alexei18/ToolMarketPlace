import type { Context } from "hono";
import type { z } from "zod";
import { ApiError, zodToApiError } from "./errors";

export async function body<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    const text = await c.req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError("VALIDATION", "Body must be valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw zodToApiError(parsed.error);
  return parsed.data;
}

export function query<S extends z.ZodType>(c: Context, schema: S): z.output<S> {
  const parsed = schema.safeParse(c.req.query());
  if (!parsed.success) throw zodToApiError(parsed.error);
  return parsed.data;
}
