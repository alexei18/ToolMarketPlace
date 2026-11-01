/*
 * First-touch source (docs/PRELAUNCH.md). The utm_* params of the landing link travel only in URLs:
 * internal links carry them along until sign-up, and onboarding sends them once. Nothing is stored in
 * the browser, so no consent is needed (see /cookies).
 */
// Not imported from @tm/shared, so the script on every page doesn't pull in zod.
const UTM_PARAMS = ["utm_source", "utm_campaign", "utm_content"];

/** The utm_* params of a query string, or null when there are none. */
export function utmParams(search: string): URLSearchParams | null {
  const from = new URLSearchParams(search);
  const out = new URLSearchParams();
  for (const k of UTM_PARAMS) {
    const v = from.get(k)?.trim();
    if (v) out.set(k, v.slice(0, 100));
  }
  return out.size ? out : null;
}

/** Adds the utm_* params to a same-site path (e.g. "/onboarding?next=/feed"), keeping its own params. */
export function withUtm(path: string, utm: URLSearchParams | null): string {
  if (!utm) return path;
  const url = new URL(path, "http://x");
  for (const [k, v] of utm) if (!url.searchParams.has(k)) url.searchParams.set(k, v);
  return url.pathname + url.search + url.hash;
}
