import type { APIRoute } from "astro";
import { apiCall } from "../lib/api";
import { siteConfig } from "../lib/config";

interface SitemapData {
  products: { slug: string; updatedAt: number }[];
  categories: string[];
  makers: string[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export const GET: APIRoute = async (ctx) => {
  const { siteUrl } = siteConfig();
  const res = await apiCall<SitemapData>("/sitemap");
  if (!res.ok) return new Response("Sitemap unavailable", { status: 503 });
  const urls: string[] = [
    `<url><loc>${siteUrl}/</loc><changefreq>hourly</changefreq></url>`,
    `<url><loc>${siteUrl}/search</loc><changefreq>daily</changefreq></url>`,
    ...res.data.categories.map((c) => `<url><loc>${siteUrl}/c/${esc(c)}</loc><changefreq>hourly</changefreq></url>`),
    ...res.data.products.map((p) => `<url><loc>${siteUrl}/p/${esc(p.slug)}</loc><lastmod>${new Date(p.updatedAt * 1000).toISOString()}</lastmod></url>`),
    ...res.data.makers.map((m) => `<url><loc>${siteUrl}/m/${esc(m)}</loc></url>`),
  ];
  ctx.cache.set({ maxAge: 3600, tags: ["sitemap"] });
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
