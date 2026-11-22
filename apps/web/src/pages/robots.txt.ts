import type { APIRoute } from "astro";
import { siteConfig } from "../lib/config";

export const GET: APIRoute = () => {
  const { siteUrl } = siteConfig();
  const body = [
    "User-agent: *",
    "Allow: /",
    // docs/SEO.md, plus the other account and tool pages, which are private and never indexed.
    ...[
      "/dashboard",
      "/admin",
      "/settings",
      "/saved",
      "/perks/claimed",
      "/search",
      "/api",
      "/feed",
      "/notifications",
      "/onboarding",
      "/login",
      "/signup",
      "/fragments",
      "/internal",
      "/_internal",
    ].map((p) => `Disallow: ${p}`),
    "",
    `Sitemap: ${siteUrl}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
};
