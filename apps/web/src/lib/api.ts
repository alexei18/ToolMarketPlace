import { env } from "cloudflare:workers";
import type { ApiErrorBody } from "@tm/shared";
import { siteConfig } from "./config";

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export type ApiResult<T> = { ok: true; data: T; status: number } | { ok: false; status: number; error: ApiErrorBody["error"] };

interface CallOptions {
  /** Forward the visitor's cookies (account pages). Public, cacheable pages must not. */
  request?: Request;
  method?: string;
  body?: unknown;
}

/**
 * Calls the API worker from the server. Production uses the `API` service binding (no public
 * round trip); `astro dev` talks to the local `wrangler dev` API over HTTP.
 */
export async function apiCall<T>(path: string, opts: CallOptions = {}): Promise<ApiResult<T>> {
  const { apiUrl, siteUrl } = siteConfig();
  const headers = new Headers({ accept: "application/json", origin: siteUrl });
  // Marks the call as coming from the site worker (exempt from the API's per-IP rate limit).
  if (env.INTERNAL_SECRET) headers.set("x-internal-key", env.INTERNAL_SECRET);
  if (opts.request) {
    const cookie = opts.request.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);
    const ip = opts.request.headers.get("cf-connecting-ip");
    if (ip) headers.set("cf-connecting-ip", ip);
  }
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(opts.body);
  }
  const req = new Request(`${apiUrl}${path}`, { method: opts.method ?? "GET", headers, body });
  let res: Response;
  try {
    res = env.API && !import.meta.env.DEV ? await env.API.fetch(req) : await fetch(req);
  } catch (err) {
    console.error("[api] unreachable", path, err);
    return { ok: false, status: 503, error: { code: "INTERNAL", message: "The service is temporarily unavailable." } };
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const error = (json as ApiErrorBody | null)?.error ?? { code: "INTERNAL" as const, message: `Request failed (${res.status})` };
    return { ok: false, status: res.status, error };
  }
  return { ok: true, data: json as T, status: res.status };
}

/** Like apiCall but throws, for data a page cannot render without. */
export async function api<T>(path: string, opts: CallOptions = {}): Promise<T> {
  const r = await apiCall<T>(path, opts);
  if (!r.ok) throw new ApiFailure(r.status, r.error.code, r.error.message);
  return r.data;
}

/** Cheap check for the readable hint cookie the API sets next to the session cookie. */
export function hasSessionHint(request: Request): boolean {
  return /(?:^|;\s*)tm_auth=1/.test(request.headers.get("cookie") ?? "");
}
