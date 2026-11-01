/*
 * Waitlist mode (docs/tiktok-campaign.md): the homepage is the waitlist and anonymous visitors to
 * any other page are sent there, except the pages below. Signed-in accounts (invited makers and
 * admins) see the whole site.
 */

/** Pages anyone can open during the waitlist. */
const OPEN_PATHS = new Set([
  "/",
  "/about",
  "/makers",
  "/ranking",
  // Legal pages (docs/LEGAL.md)
  "/terms",
  "/terms/makers",
  "/privacy",
  "/cookies",
  "/guidelines",
  "/report",
  "/legal",
  // Signing in, for invited makers and admins
  "/login",
  "/forgot-password",
  "/reset-password",
  "/suspended",
  // Pages other pages rewrite to
  "/404",
  "/gone",
  "/unavailable",
]);

/** Sections that send signed-out visitors to /login themselves, or need no session at all. */
const OPEN_PREFIXES = ["/dashboard", "/admin", "/waitlist/", "/join", "/sitemaps/", "/internal/"];

export function isOpenDuringWaitlist(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  if (OPEN_PATHS.has(path)) return true;
  if (OPEN_PREFIXES.some((p) => path === p.replace(/\/$/, "") || path.startsWith(p.endsWith("/") ? p : `${p}/`))) return true;
  // Files (robots.txt, sitemap.xml, images, scripts)
  return /\.[a-z0-9]+$/i.test(path);
}

/** Query params a redirect to the waitlist keeps: the campaign tags and the share code. */
const KEPT_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "ref"];

/** "/" plus the utm_* and ref params of `url`. */
export function waitlistLocation(url: URL): string {
  const out = new URLSearchParams();
  for (const k of KEPT_PARAMS) {
    const v = url.searchParams.get(k);
    if (v) out.set(k, v);
  }
  return out.size ? `/?${out}` : "/";
}
