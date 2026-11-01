import { isPrivateIp, isPublicHostname } from "@tm/shared";
import { resolveIps } from "./dns";

export class FetchError extends Error {
  /** "too_large": the site answered, but with more than maxBytes. */
  constructor(
    message: string,
    readonly reason?: "too_large",
  ) {
    super(message);
  }
}

export interface SafeResponse {
  url: string;
  status: number;
  headers: Headers;
  body: Uint8Array;
}

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  accept?: string;
  maxRedirects?: number;
}

export const BOT_UA = "Mozilla/5.0 (compatible; ToolMarketBot/1.0; +https://github.com/alexei18/ToolMarketPlace)";

async function assertPublicTarget(url: URL): Promise<void> {
  if (url.protocol !== "https:") throw new FetchError("Only https links can be fetched.");
  if (url.username || url.password) throw new FetchError("Links with credentials are not allowed.");
  const host = url.hostname.toLowerCase();
  if (!isPublicHostname(host)) throw new FetchError("This address is not allowed.");
  let ips: string[];
  try {
    ips = await resolveIps(host);
  } catch {
    throw new FetchError(`Could not resolve ${host}.`);
  }
  if (ips.length === 0) throw new FetchError(`${host} does not resolve.`);
  if (ips.some(isPrivateIp)) throw new FetchError("This address points to a private network.");
}

/**
 * Fetches a public https URL with SSRF protection: no private/loopback targets (checked on
 * every redirect hop), a 5 s timeout and a hard cap on the response size (2 MB by default).
 */
export async function safeFetch(input: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
  const maxRedirects = opts.maxRedirects ?? 3;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 5000);
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new FetchError("Invalid URL.");
  }

  for (let hop = 0; ; hop++) {
    await assertPublicTarget(url);
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        redirect: "manual",
        signal,
        headers: { "user-agent": BOT_UA, accept: opts.accept ?? "*/*", "accept-language": "en" },
      });
    } catch (err) {
      throw new FetchError(err instanceof Error && err.name === "TimeoutError" ? "The site took too long to respond." : "The site could not be reached.");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      await res.body?.cancel();
      if (hop >= maxRedirects) throw new FetchError("Too many redirects.");
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > maxBytes) {
      await res.body?.cancel();
      throw new FetchError("The response is too large.", "too_large");
    }
    const body = await readLimited(res, maxBytes);
    return { url: url.toString(), status: res.status, headers: res.headers, body };
  }
}

async function readLimited(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new FetchError("The response is too large.", "too_large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
