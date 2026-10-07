import type { APIRoute } from "astro";
import { siteConfig } from "../lib/config";

export const GET: APIRoute = () => {
  const { siteUrl } = siteConfig();
  const body = [
    "User-agent: *",
    "Allow: /",
    // Account and tool pages are private and never indexed.
    ...["/feed", "/saved", "/perks", "/notifications", "/settings", "/onboarding", "/dashboard", "/admin", "/login", "/signup", "/fragments", "/_internal"].map((p) => `Disallow: ${p}`),
    "",
    `Sitemap: ${siteUrl}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
};
