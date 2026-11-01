import { and, asc, eq } from "drizzle-orm";
import { productImages, products, type Database } from "@tm/db";
import type { Env } from "../env";
import { WORDMARK_SVG } from "./brand";
import { imageUrl } from "./products";
import { renderHtml } from "./screenshot";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The dark-ink wordmark (the card is white), 40px tall at its own aspect ratio (9206.9 × 2112.9). */
const LOGO = `<img class="brand" src="data:image/svg+xml,${encodeURIComponent(WORDMARK_SVG)}" alt="Tryworthy" width="174" height="40">`;

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The 1200×630 card: white background, product image, product name and the wordmark. */
export function ogHtml(opts: { title: string; image: { dataUri: string } | null }): string {
  const shot = opts.image ? `<img src="${opts.image.dataUri}" alt="">` : `<span>${esc(opts.title.slice(0, 2))}</span>`;
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@600&display=block">
<style>
*{margin:0;box-sizing:border-box}
body{width:${OG_WIDTH}px;height:${OG_HEIGHT}px;background:#fff;color:#111;font-family:Inter,system-ui,sans-serif;font-weight:600;display:flex;align-items:center;gap:56px;padding:64px}
.text{flex:1;min-width:0;height:100%;display:flex;flex-direction:column;justify-content:space-between}
h1{font-size:56px;line-height:1.06;letter-spacing:-0.03em;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
.brand{display:block;align-self:flex-start}
.shot{flex:none;width:620px;height:388px;border-radius:20px;overflow:hidden;border:2px solid #e8e8e6;background:#f7f7f5;display:grid;place-items:center;font-size:96px;color:#8f8f8b}
.shot img{width:100%;height:100%;object-fit:cover}
</style></head><body>
<div class="text"><h1>${esc(opts.title)}</h1>${LOGO}</div>
<div class="shot">${shot}</div>
</body></html>`;
}

/**
 * The Open Graph image of a live product, rendered once per product version with Browser Rendering
 * and kept in R2 (og/<id>-<updatedAt>.png). Without Browser Rendering it redirects to the product
 * image (or the site's default card) for a few minutes, so a later request can still render it.
 */
export async function productOgImage(env: Env, db: Database, slug: string): Promise<Response> {
  const p = await db
    .select({ id: products.id, title: products.title, updatedAt: products.updatedAt })
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.status, "live")))
    .get();
  if (!p) return new Response("Not found", { status: 404 });

  const key = `og/${p.id}-${p.updatedAt}.png`;
  const headers = { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" };
  const cached = await env.IMAGES_BUCKET.get(key);
  if (cached) return new Response(cached.body, { headers });

  const img = await db.select({ key: productImages.r2Key }).from(productImages).where(eq(productImages.productId, p.id)).orderBy(asc(productImages.sortOrder)).get();
  const obj = img ? await env.IMAGES_BUCKET.get(img.key) : null;
  const image = obj ? { dataUri: `data:${obj.httpMetadata?.contentType ?? "image/webp"};base64,${base64(new Uint8Array(await obj.arrayBuffer()))}` } : null;
  const png = await renderHtml(env, ogHtml({ title: p.title, image }), OG_WIDTH, OG_HEIGHT);
  if (!png) {
    const fallback = img ? imageUrl(env, img.key) : `${env.WEB_ORIGIN.replace(/\/$/, "")}/og.png`;
    return new Response(null, { status: 302, headers: { Location: fallback, "Cache-Control": "public, max-age=300" } });
  }

  await env.IMAGES_BUCKET.put(key, png, { httpMetadata: { contentType: "image/png", cacheControl: "public, max-age=86400" } });
  // Drop the cards of earlier versions.
  const old = await env.IMAGES_BUCKET.list({ prefix: `og/${p.id}-` });
  const stale = old.objects.map((o) => o.key).filter((k) => k !== key);
  if (stale.length) await env.IMAGES_BUCKET.delete(stale);
  return new Response(png, { headers });
}
