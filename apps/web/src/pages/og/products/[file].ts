import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { siteConfig } from "../../../lib/config";

/**
 * The product's Open Graph card on the site's own domain. The API renders and stores it; this
 * passes its answer through unchanged (including the short-lived redirect to a fallback image).
 */
export const GET: APIRoute = async ({ params, url, request }) => {
  const { apiUrl } = siteConfig();
  const headers = new Headers();
  // Same marks as apiCall: exempt from the per-IP limit, with the visitor's IP for logs.
  if (env.INTERNAL_SECRET) headers.set("x-internal-key", env.INTERNAL_SECRET);
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) headers.set("cf-connecting-ip", ip);
  const req = new Request(`${apiUrl}/og/products/${encodeURIComponent(params.file!)}${url.search}`, { headers, redirect: "manual" });
  const res = env.API && !import.meta.env.DEV ? await env.API.fetch(req) : await fetch(req);
  return new Response(res.body, res);
};
