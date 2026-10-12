import type { AstroGlobal } from "astro";
import type { MeDTO } from "@tm/shared";
import { apiCall, hasSessionHint } from "./api";

export type Me = MeDTO & { banned?: boolean };

/**
 * Loads the signed-in user for an account page, or returns a redirect to /login.
 * Usage: `const me = await requireMe(Astro); if (me instanceof Response) return me;`
 */
export async function requireMe(Astro: AstroGlobal): Promise<Me | Response> {
  Astro.response.headers.set("Cache-Control", "private, no-store");
  const next = encodeURIComponent(Astro.url.pathname + Astro.url.search);
  if (!hasSessionHint(Astro.request)) return Astro.redirect(`/login?next=${next}`);
  const res = await apiCall<Me>("/me", { request: Astro.request });
  if (res.ok) return res.data;
  // The hint cookie can outlive the session (expired, signed out elsewhere, banned). `reason` makes
  // /login show the form instead of sending a "signed-in" visitor straight back here, forever.
  if (res.status < 500) return Astro.redirect(`/login?next=${next}&reason=expired`);
  // The API is down: the visitor is still signed in, so don't ask them to log in.
  return Astro.rewrite("/unavailable");
}
