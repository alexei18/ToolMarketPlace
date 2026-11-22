/*
 * npm run video:seed
 * Fills the video-capture database (its own stack, see stack.ts) with the fictional catalog in
 * products.ts: one maker per product, a generated thumbnail, perks and pre-launch products. It
 * goes through the real API (sign-up, upload, publish, perks) and uses SQL only for what can't be
 * done offline: confirming emails, verifying the example.com domains, the publish order, the
 * quality flag the ranking job would set and a fixed Trending order. Nobody saves or claims
 * anything, so no count exists.
 *
 * Deterministic: it only runs on an empty database (recreate the stack to seed again) and /top
 * always lists the products in the order of products.ts.
 */
import { chromium } from "playwright";
import { TERMS_VERSION } from "../../../packages/shared/src/legal";
import { fail } from "../scripts/lib/common";
import { SEED_PRODUCTS, TRENDING } from "./products";
import { assertSeededSite, assertVideoContainer, UP_COMMAND, VIDEO_STACK, videoSql } from "./stack";
import { thumbnailPng } from "./thumbnails";

const { api: API, web: WEB } = VIDEO_STACK;
const PASSWORD = "video-seed-password";

class Session {
  cookie = "";
  async req<T>(method: string, path: string, body?: unknown, raw?: BodyInit): Promise<T> {
    const headers: Record<string, string> = { origin: WEB };
    if (this.cookie) headers.cookie = this.cookie;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${API}${path}`, { method, headers, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    const jar = new Map(this.cookie.split("; ").filter(Boolean).map((p) => [p.split("=")[0]!, p] as const));
    for (const c of res.headers.getSetCookie()) {
      const pair = c.split(";")[0]!;
      jar.set(pair.split("=")[0]!, pair);
    }
    this.cookie = [...jar.values()].join("; ");
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
    return (text ? JSON.parse(text) : null) as T;
  }
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const host = (slug: string) => `${slug}.example.com`;
const emailOf = (p: (typeof SEED_PRODUCTS)[number]) => `${p.maker.split(" ")[0]!.toLowerCase()}@${host(p.slug)}`;

async function waitForSite(path: string): Promise<void> {
  // The site's binding to the API drops for a while after `wrangler d1 execute`; it comes back on its own.
  for (let i = 0; i < 90; i++) {
    const res = await fetch(WEB + path).catch(() => null);
    if (res?.ok) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  fail(`${WEB}${path} didn't come back within three minutes`);
}

async function main() {
  await assertVideoContainer();
  if (!(await fetch(`${API}/health`).then((r) => r.ok, () => false))) fail(`The video-capture API (${API}) isn't answering. Start the stack:\n  ${UP_COMMAND}`);
  const [counts] = await videoSql<{ products: number; users: number }>("SELECT (SELECT count(*) FROM products) AS products, (SELECT count(*) FROM user) AS users");
  if (counts!.products > 0 || counts!.users > 0) {
    fail(`The video-capture database isn't empty (${counts!.products} products, ${counts!.users} users). To seed again, recreate it:\n  ${UP_COMMAND.replace(" up -d --build", " down -v")}\n  ${UP_COMMAND}`);
  }

  console.log(`Seeding ${SEED_PRODUCTS.length} products into the video-capture database (${API})…`);
  // Invitations in case the stack runs as the waitlist; removed at the end.
  await videoSql(
    SEED_PRODUCTS.map((p, i) => `INSERT OR IGNORE INTO waitlist (id, email, role, ref_code, confirmed_at, invited_at, created_at) VALUES ('vseed-${i}', ${q(emailOf(p))}, 'maker', 'vseed${i}', 1, 1, 1)`).join("; "),
  );

  const makers: { s: Session; id: string }[] = [];
  for (const p of SEED_PRODUCTS) {
    const s = new Session();
    const r = await s.req<{ user: { id: string } }>("POST", "/auth/sign-up/email", { email: emailOf(p), password: PASSWORD, name: p.maker, acceptedTerms: TERMS_VERSION });
    makers.push({ s, id: r.user.id });
  }
  await videoSql(
    [
      `UPDATE user SET email_verified = 1`,
      ...SEED_PRODUCTS.map((p, i) => `INSERT INTO domains (id, user_id, hostname, token, method, verified_at, created_at) VALUES ('vdom-${i}', ${q(makers[i]!.id)}, ${q(host(p.slug))}, 'video-seed', 'dns', unixepoch(), unixepoch())`),
    ].join("; "),
  );

  const browser = await chromium.launch();
  const ids: string[] = [];
  try {
    for (const [i, p] of SEED_PRODUCTS.entries()) {
      const m = makers[i]!;
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(await thumbnailPng(browser, p.slug, p.thumb.layout, p.thumb.accent))], { type: "image/png" }), "thumbnail.png");
      const up = await m.s.req<{ key: string }>("POST", "/maker/uploads", undefined, form);
      const created = await m.s.req<{ id: string; slug: string }>("POST", "/maker/products", {
        url: `https://${host(p.slug)}`,
        title: p.title,
        tagline: p.tagline,
        description: p.description,
        categories: p.categories,
        stage: p.stage,
        pricing: p.pricing,
        hasAi: p.hasAi ?? false,
        images: [{ key: up.key }],
      });
      if (created.slug !== p.slug) fail(`${p.title} got the slug "${created.slug}", expected "${p.slug}" (update products.ts)`);
      if (p.perk) await m.s.req("PUT", `/maker/products/${created.id}/perks`, { perks: [p.perk] });
      ids.push(created.id);
      console.log(`  ✓ ${p.title}`);
    }
  } finally {
    await browser.close();
  }

  // Fixed order: one hour apart, older than the 48 h "Just launched" window, quality checks passed.
  const base = Math.floor(Date.now() / 1000) - 4 * 86400;
  await videoSql(
    [
      ...ids.map((id, i) => `UPDATE products SET published_at = ${base - i * 3600}, updated_at = ${base - i * 3600}, quality_ok = 1 WHERE id = ${q(id)}`),
      ...TRENDING.map((slug, i) => `UPDATE products SET score_trending = ${TRENDING.length - i} WHERE id = ${q(ids[SEED_PRODUCTS.findIndex((p) => p.slug === slug)]!)}`),
      `DELETE FROM waitlist WHERE id LIKE 'vseed-%'`,
    ].join("; "),
  );

  await waitForSite("/top");
  await assertSeededSite(WEB);
  // Cached pages can lag behind the database: retry until /top shows the seeded order.
  const expected = SEED_PRODUCTS.map((p) => p.slug);
  let order: string[] = [];
  for (let i = 0; i < 30; i++) {
    const html = await fetch(`${WEB}/top`).then((r) => r.text());
    order = [...new Set([...html.matchAll(/class="product-row"[\s\S]*?href="\/p\/([a-z0-9-]+)"/g)].map((m) => m[1]!))];
    if (order.join() === expected.slice(0, order.length).join() && order.length > 0) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (order.join() !== expected.slice(0, order.length).join() || order.length === 0) fail(`/top lists ${order.join(", ")}; expected ${expected.join(", ")}`);
  const trendingHtml = await fetch(`${WEB}/trending`).then((r) => r.text());
  const trending = [...new Set([...trendingHtml.matchAll(/class="product-row"[\s\S]*?href="\/p\/([a-z0-9-]+)"/g)].map((m) => m[1]!))];
  if (trending.join() !== TRENDING.join()) fail(`/trending lists ${trending.join(", ")}; expected ${TRENDING.join(", ")}`);
  console.log(`\nDone: ${ids.length} products; /top starts with ${order.slice(0, 3).join(", ")}, /trending with ${trending.slice(0, 3).join(", ")}. Captures read ${WEB}.`);
}

main().catch((err) => fail(String(err instanceof Error ? err.message : err)));
