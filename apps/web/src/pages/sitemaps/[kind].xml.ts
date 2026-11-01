import type { APIRoute } from "astro";
import { apiCall } from "../../lib/api";
import { siteConfig } from "../../lib/config";
import { SITEMAPS } from "../../lib/seo";
import { isOpenDuringWaitlist } from "../../lib/waitlist";

/** Public pages that aren't built from D1 rows. */
const PAGES = ["/", "/top", "/trending", "/new", "/perks", "/ranking", "/makers", "/about"];

interface Entry {
  path: string;
  updatedAt?: number;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export const GET: APIRoute = async (ctx) => {
  const kind = ctx.params.kind as (typeof SITEMAPS)[number];
  if (!SITEMAPS.includes(kind)) return new Response("Not found", { status: 404 });
  const { siteUrl } = siteConfig();
  let entries: Entry[] = PAGES.map((path) => ({ path }));
  if (kind === "pages") {
    // During the waitlist the other pages redirect to it (lib/waitlist.ts).
    const site = await apiCall<{ prelaunch: boolean }>("/site");
    if (!site.ok) return new Response("Sitemap unavailable", { status: 503 });
    if (site.data.prelaunch) entries = entries.filter((e) => isOpenDuringWaitlist(e.path));
  } else {
    const res = await apiCall<{ items: Entry[] }>(`/sitemap/${kind}`);
    if (!res.ok) return new Response("Sitemap unavailable", { status: 503 });
    entries = res.data.items;
  }
  const urls = entries.map(
    (e) => `<url><loc>${siteUrl}${esc(e.path)}</loc>${e.updatedAt ? `<lastmod>${new Date(e.updatedAt * 1000).toISOString()}</lastmod>` : ""}</url>`,
  );
  // Built from D1 through the API, cached for an hour; publishing and edits purge the "sitemap" tag.
  ctx.cache.set({ maxAge: 3600, tags: ["sitemap"] });
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
