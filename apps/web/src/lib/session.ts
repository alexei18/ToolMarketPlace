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
  if (!res.ok) return Astro.redirect(`/login?next=${next}`);
  return res.data;
}
