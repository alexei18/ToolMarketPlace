import type { APIRoute } from "astro";
import { siteConfig } from "../lib/config";
import { SITEMAPS } from "../lib/seo";

/** Sitemap index (docs/SEO.md): one child sitemap per kind, see sitemaps/[kind].xml.ts. */
export const GET: APIRoute = (ctx) => {
  const { siteUrl } = siteConfig();
  const entries = SITEMAPS.map((kind) => `<sitemap><loc>${siteUrl}/sitemaps/${kind}.xml</loc></sitemap>`);
  ctx.cache.set({ maxAge: 3600, tags: ["sitemap"] });
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</sitemapindex>`, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
