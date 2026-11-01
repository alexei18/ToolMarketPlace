/**
 * Renders every public page type on a running site and checks the docs/SEO.md basics.
 * Needs the site and API running (e.g. the local test stack):
 *   SEO_TEST_URL=http://localhost:4321 bun test apps/web/test/seo.test.ts
 * Optional: SEO_GONE_PATH=/p/<slug of a hidden or removed product> to check the 410 page.
 */
import { describe, expect, test } from "bun:test";
import { DESCRIPTION_MAX, TITLE_MAX } from "../src/lib/seo";

const BASE = process.env.SEO_TEST_URL?.replace(/\/$/, "");
const GONE = process.env.SEO_GONE_PATH;

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

function meta(html: string, attr: "name" | "property", key: string): string | null {
  const tag = html.match(new RegExp(`<meta[^>]*${attr}="${key}"[^>]*>`))?.[0];
  return tag ? decode(tag.match(/content="([^"]*)"/)?.[1] ?? "") : null;
}

async function page(path: string) {
  const res = await fetch(BASE + path, { redirect: "manual" });
  const html = await res.text();
  return {
    status: res.status,
    html,
    title: decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ""),
    description: meta(html, "name", "description"),
    canonical: html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? null,
    noindex: /<meta name="robots" content="noindex/.test(html),
    h1s: html.match(/<h1[\s>]/g)?.length ?? 0,
  };
}

async function sitemapPaths(kind: string): Promise<string[]> {
  const xml = await (await fetch(`${BASE}/sitemaps/${kind}.xml`)).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
}

describe.skipIf(!BASE)("SEO on every page type", () => {
  test("indexable pages: one H1, a clean canonical, title ≤ 60, description ≤ 155, OG and Twitter tags", async () => {
    const [pages, product, category, maker, week] = await Promise.all([sitemapPaths("pages"), sitemapPaths("products"), sitemapPaths("categories"), sitemapPaths("makers"), sitemapPaths("weeks")]);
    expect(pages).toEqual(["/", "/top", "/trending", "/new", "/perks", "/ranking", "/makers", "/about"]);
    // Weekly archives only exist after launch, for completed weeks with enough launches.
    const paths = [...pages, product[0], category[0], maker[0], week[0]].filter((p): p is string => !!p);
    // Product, maker and (once listed) category pages need data in the database.
    expect(product.length).toBeGreaterThan(0);
    expect(maker.length).toBeGreaterThan(0);

    for (const path of paths) {
      const p = await page(path);
      const where = `${path}: `;
      expect(where + p.status).toBe(where + 200);
      expect(where + p.h1s).toBe(where + 1);
      expect(p.canonical, path).toBe(`${new URL(BASE!).origin}${path}`);
      expect(p.noindex, path).toBe(false);
      expect(p.title.length, `${path} title "${p.title}"`).toBeLessThanOrEqual(TITLE_MAX);
      expect(p.description?.length ?? 0, `${path} description`).toBeGreaterThan(0);
      expect(p.description!.length, `${path} description "${p.description}"`).toBeLessThanOrEqual(DESCRIPTION_MAX);
      for (const key of ["og:title", "og:description", "og:url", "og:image"]) expect(meta(p.html, "property", key), `${path} ${key}`).toBeTruthy();
      for (const key of ["twitter:card", "twitter:title", "twitter:description", "twitter:image"]) expect(meta(p.html, "name", key), `${path} ${key}`).toBeTruthy();
      expect(p.html, `${path} JSON-LD`).toContain('<script type="application/ld+json">');
      expect(p.html.match(/<img\b[^>]*>/g)?.filter((img) => !/\bwidth=/.test(img) || !/\bheight=/.test(img)) ?? [], `${path} images without size`).toEqual([]);
    }
  });

  test("filtered and search URLs are noindex, with a canonical without query params", async () => {
    const [category] = await sitemapPaths("categories").then((c) => (c.length ? c : ["/c/productivity"]));
    for (const path of [`${category}?sort=new`, `${category}?ai=1`, "/top?ai=1", "/trending?pricing=free", "/search", "/search?q=notes", "/?utm_source=tiktok"]) {
      const p = await page(path);
      expect(p.canonical, path).not.toContain("?");
      if (!path.startsWith("/?")) expect(p.noindex, path).toBe(true);
    }
  });

  test("product pages point at their 1200×630 card", async () => {
    const [product] = await sitemapPaths("products");
    const p = await page(product!);
    const image = meta(p.html, "property", "og:image")!;
    expect(image).toContain(`/og/products/${product!.split("/").pop()}.png?v=`);
    // Served on the site's own domain, like the canonical URL.
    expect(new URL(image).origin).toBe(new URL(p.canonical!).origin);
    const card = await fetch(BASE + new URL(image).pathname + new URL(image).search, { redirect: "manual" });
    expect([200, 302]).toContain(card.status);
    expect(meta(p.html, "property", "og:image:width")).toBe("1200");
    expect(meta(p.html, "property", "og:image:height")).toBe("630");
  });

  test.skipIf(!GONE)("hidden or removed products answer 410 with a link to their category", async () => {
    const p = await page(GONE!);
    expect(p.status).toBe(410);
    expect(p.noindex).toBe(true);
    expect(p.canonical).toBe(`${new URL(BASE!).origin}${GONE}`);
    expect(p.html).toMatch(/href="\/c\/[^"]+"/);
  });

  test("structured data: home, category and product graphs (no ratings or reviews)", async () => {
    const origin = new URL(BASE!).origin;
    const graphs = async (path: string) => {
      const html = (await page(path)).html;
      const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
      for (const b of blocks) expect(b).not.toMatch(/<\/|<!--/);
      const nodes = blocks.flatMap((b) => JSON.parse(b)["@graph"] as { "@type": string; [k: string]: any }[]);
      expect(JSON.stringify(nodes)).not.toMatch(/AggregateRating|"Review"|aggregateRating|"review"/);
      return (type: string) => nodes.find((n) => n["@type"] === type)!;
    };

    const home = await graphs("/");
    expect(home("Organization")).toMatchObject({ url: `${origin}/` });
    expect(home("WebSite").potentialAction.target.urlTemplate).toBe(`${origin}/search?q={search_term_string}`);

    const [category] = await sitemapPaths("categories");
    const cat = await graphs(category!);
    expect(cat("CollectionPage").url).toBe(origin + category);
    const items = cat("ItemList").itemListElement as { position: number; url: string }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.map((i) => i.position)).toEqual(items.map((_, i) => i + 1));
    for (const i of items) expect(i.url).toStartWith(`${origin}/p/`);
    expect(cat("BreadcrumbList").itemListElement.at(-1).item).toBe(origin + category);
    // Filtered views are noindex and carry no ItemList.
    expect((await graphs(`${category}?sort=new`))("ItemList")).toBeUndefined();

    // /top, /trending and /new describe the list they show.
    for (const path of ["/top", "/trending", "/new"]) {
      const g = await graphs(path);
      expect(g("CollectionPage").url, path).toBe(origin + path);
      expect(g("BreadcrumbList").itemListElement.at(-1).item, path).toBe(origin + path);
      for (const i of g("ItemList").itemListElement as { url: string }[]) expect(i.url).toStartWith(`${origin}/p/`);
    }
    expect((await graphs("/top?ai=1"))("ItemList")).toBeUndefined();

    const [product] = await sitemapPaths("products");
    const prod = await graphs(product!);
    const app = prod("SoftwareApplication");
    expect(app).toMatchObject({ url: origin + product });
    expect(typeof app.name).toBe("string");
    if (app.offers) expect(app.offers.price).toBe("0");
    expect(prod("BreadcrumbList").itemListElement.at(-1).item).toBe(origin + product);
  });

  test("legal pages, and the footer links on every page (docs/LEGAL.md)", async () => {
    const legal = ["/terms", "/terms/makers", "/privacy", "/cookies", "/guidelines", "/report", "/legal"];
    for (const path of legal) {
      const p = await page(path);
      const where = `${path}: `;
      expect(where + p.status).toBe(where + 200);
      expect(where + p.h1s).toBe(where + 1);
      expect(p.canonical, path).toBe(`${new URL(BASE!).origin}${path}`);
      expect(p.title.length, `${path} title "${p.title}"`).toBeLessThanOrEqual(TITLE_MAX);
      expect(p.description!.length, `${path} description`).toBeLessThanOrEqual(DESCRIPTION_MAX);
      for (const key of ["og:title", "og:description", "og:url", "og:image"]) expect(meta(p.html, "property", key), `${path} ${key}`).toBeTruthy();
      expect(p.html, `${path} JSON-LD`).toContain('<script type="application/ld+json">');
    }
    // Google OAuth verification: the homepage links to /privacy and /terms in plain HTML.
    const [product] = await sitemapPaths("products");
    for (const path of ["/", "/top", product!]) {
      const html = (await page(path)).html;
      for (const href of ["/about", "/makers", "/ranking", "/guidelines", "/terms", "/terms/makers", "/privacy", "/cookies", "/report", "/legal", "/legal#contact"]) expect(html, `${path} → ${href}`).toContain(`href="${href}"`);
    }
  });

  test("robots.txt and the sitemap index", async () => {
    const robots = await (await fetch(`${BASE}/robots.txt`)).text();
    for (const path of ["/dashboard", "/admin", "/settings", "/saved", "/perks/claimed", "/search", "/api"]) expect(robots).toContain(`Disallow: ${path}\n`);
    expect(robots).not.toContain("Disallow: /perks\n");
    expect(robots).toContain(`Sitemap: ${new URL(BASE!).origin}/sitemap.xml`);
    const index = await (await fetch(`${BASE}/sitemap.xml`)).text();
    expect([...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname)).toEqual(["/sitemaps/pages.xml", "/sitemaps/products.xml", "/sitemaps/categories.xml", "/sitemaps/makers.xml", "/sitemaps/weeks.xml"]);
    for (const kind of ["pages", "products", "categories", "makers", "weeks"]) {
      for (const path of await sitemapPaths(kind)) expect(path).not.toContain("?");
    }
  });
});
