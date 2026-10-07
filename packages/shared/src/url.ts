const TRACKING_PARAMS = new Set(["ref", "fbclid", "gclid"]);

/**
 * Normalizes a product URL so the same product can only be listed once:
 * https, lowercase host, no `www.`, no tracking params (`utm_*`, `ref`, `fbclid`, `gclid`),
 * no fragment and no trailing slash. Returns null for anything that is not a public web URL.
 */
export function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;

  const host = normalizeHostname(url.hostname);
  if (!host || !isPublicHostname(host)) return null;

  const params = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    const k = key.toLowerCase();
    if (k.startsWith("utm_") || TRACKING_PARAMS.has(k)) continue;
    params.append(key, value);
  }
  const query = params.toString();
  const path = url.pathname.replace(/\/+$/, "");
  const port = url.port && url.port !== "443" && url.port !== "80" ? `:${url.port}` : "";
  return `https://${host}${port}${path}${query ? `?${query}` : ""}`;
}

/** Lowercases a hostname and strips a leading `www.` and a trailing dot. */
export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

/**
 * Accepts `myapp.com`, `https://www.myapp.com/path` etc. and returns `myapp.com`,
 * or null when the value is not a registrable public hostname.
 */
export function parseDomainInput(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname;
  } catch {
    return null;
  }
  const normalized = normalizeHostname(host);
  return isPublicHostname(normalized) ? normalized : null;
}

/** True when `host` equals `domain` or is a subdomain of it. */
export function hostBelongsToDomain(host: string, domain: string): boolean {
  const h = normalizeHostname(host);
  const d = normalizeHostname(domain);
  return h === d || h.endsWith(`.${d}`);
}

/** Returns every candidate parent domain of a host, most specific first: a.b.c.com → [a.b.c.com, b.c.com, c.com]. */
export function domainCandidates(host: string): string[] {
  const parts = normalizeHostname(host).split(".");
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join("."));
  return out;
}

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".intranet", ".test", ".invalid", ".example"];

/**
 * Rejects hosts that must never be fetched or listed: IP literals, localhost,
 * single-label names and reserved suffixes (SSRF protection, first line).
 */
export function isPublicHostname(host: string): boolean {
  const h = host.toLowerCase();
  if (!h || h.length > 253) return false;
  if (h === "localhost" || BLOCKED_SUFFIXES.some((s) => h.endsWith(s))) return false;
  if (h.startsWith("[") || h.includes(":")) return false; // IPv6 literal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false; // IPv4 literal
  if (/^\d+$/.test(h) || /^0x[0-9a-f]+$/i.test(h)) return false; // integer / hex IP forms
  if (!h.includes(".")) return false;
  const labels = h.split(".");
  if (labels.some((l) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l))) return false;
  const tld = labels[labels.length - 1]!;
  return /[a-z]/.test(tld);
}

/** True for IPs in private, loopback, link-local, CGNAT, multicast or reserved ranges. */
export function isPrivateIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6);
}
