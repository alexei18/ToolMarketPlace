import { defineMiddleware } from "astro:middleware";
import { apiCall, hasSessionHint } from "./lib/api";
import { isOpenDuringWaitlist, waitlistLocation } from "./lib/waitlist";

/** How long an isolate trusts its last read of the site mode. */
const MODE_TTL_MS = 30_000;
// Until the API answers, assume the waitlist runs: it is the production default.
let mode = { readAt: 0, prelaunch: true };

async function prelaunch(): Promise<boolean> {
  if (Date.now() - mode.readAt < MODE_TTL_MS) return mode.prelaunch;
  const res = await apiCall<{ prelaunch: boolean }>("/site");
  // When the API is down, keep the last known mode and ask again on the next request.
  if (res.ok) mode = { readAt: Date.now(), prelaunch: res.data.prelaunch };
  return mode.prelaunch;
}

/**
 * Waitlist mode (lib/waitlist.ts). Cached pages are served before this runs, so neither the redirect
 * nor a page rendered for a signed-in visitor may land in the shared cache.
 */
export const onRequest = defineMiddleware(async (ctx, next) => {
  if (isOpenDuringWaitlist(ctx.url.pathname) || !(await prelaunch())) return next();
  if (!hasSessionHint(ctx.request)) {
    return new Response(null, { status: 302, headers: { Location: waitlistLocation(ctx.url), "Cache-Control": "no-store" } });
  }
  const res = await next();
  // Astro adds the page's cache headers after middleware; this cancels what the page asked for.
  ctx.cache.set(false);
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "private, no-store");
  return out;
});
