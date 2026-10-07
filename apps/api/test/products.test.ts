import { afterEach, describe, expect, test } from "bun:test";
import { flushCounters } from "../src/lib/counters";
import { services } from "../src/middleware";
import { Client, PAGE_HTML, mockFetch, pngBytes, settle, setup, signUp, verifyDomain, type TestContext } from "./helpers";

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

function sitesMock(pages: Record<string, { html?: string; image?: Uint8Array; status?: number }>) {
  restore = mockFetch((url) => {
    const page = pages[url.toString()] ?? pages[url.toString().replace(/\/$/, "")];
    if (!page) return new Response("nope", { status: 404 });
    if (page.image) return new Response(page.image, { headers: { "content-type": "image/png" } });
    return new Response(page.html ?? "", { status: page.status ?? 200, headers: { "content-type": "text/html" } });
  });
}

async function maker(t: TestContext, host = "myapp.com") {
  const m = await signUp(t, { name: "Maker" });
  verifyDomain(t, m.id, host);
  return m;
}

async function publish(client: Client, overrides: Record<string, unknown> = {}) {
  return client.post("/maker/products", {
    url: "https://myapp.com",
    title: "My App",
    tagline: "Does the thing",
    description: "A **great** app.",
    categories: ["ai", "productivity"],
    stage: "beta",
    pricing: "freemium",
    feedbackMode: "public",
    roadmapEnabled: true,
    ...overrides,
  });
}

describe("domains", () => {
  test("add, verify via DNS TXT and via meta tag", async () => {
    const t = setup();
    const { client } = await signUp(t);
    const added = await client.post("/me/domains", { domain: "https://www.MyApp.com/x" });
    expect(added.status).toBe(201);
    expect(added.data.hostname).toBe("myapp.com");
    expect(added.data.dnsName).toBe("_verify.myapp.com");
    const token = added.data.token as string;

    restore = mockFetch(() => undefined, {});
    const fail = await client.post(`/me/domains/${added.data.id}/verify`, { method: "dns" });
    expect(fail.status).toBe(422);
    expect(fail.data.error.code).toBe("VERIFICATION_FAILED");
    restore();

    restore = mockFetch(() => undefined, { "TXT:_verify.myapp.com": ["other", token] });
    const ok = await client.post(`/me/domains/${added.data.id}/verify`, { method: "dns" });
    expect(ok.status).toBe(200);
    expect(ok.data.verifiedAt).toBeGreaterThan(0);
    expect((await client.get("/me")).data.isMaker).toBe(true);
    restore();

    const second = await client.post("/me/domains", { domain: "tool.dev" });
    sitesMock({ "https://tool.dev/": { html: PAGE_HTML("Tool", { meta: `<meta name="toolmarket-verification" content="${second.data.token}">` }) } });
    const meta = await client.post(`/me/domains/${second.data.id}/verify`, { method: "meta" });
    expect(meta.status).toBe(200);
    expect(meta.data.method).toBe("meta");
  });

  test("a verified domain belongs to one account; pending claims can be taken over", async () => {
    const t = setup();
    const a = await signUp(t);
    const b = await signUp(t);
    const pending = await a.client.post("/me/domains", { domain: "shared.io" });
    const takeover = await b.client.post("/me/domains", { domain: "shared.io" });
    expect(takeover.status).toBe(201);
    expect(takeover.data.token).not.toBe(pending.data.token);
    t.sqlite.run("UPDATE domains SET verified_at = 1 WHERE hostname = 'shared.io'");
    const again = await a.client.post("/me/domains", { domain: "shared.io" });
    expect(again.status).toBe(409);
    expect(again.data.error.code).toBe("DOMAIN_TAKEN");
  });

  test("unverified email can't add domains; private hosts are rejected", async () => {
    const t = setup();
    const u = await signUp(t, { verified: false });
    expect((await u.client.post("/me/domains", { domain: "x.com" })).data.error.code).toBe("EMAIL_NOT_VERIFIED");
    const v = await signUp(t);
    expect((await v.client.post("/me/domains", { domain: "localhost" })).data.error.code).toBe("INVALID_URL");
    expect((await v.client.post("/me/domains", { domain: "10.0.0.1" })).data.error.code).toBe("INVALID_URL");
  });
});

describe("publishing", () => {
  test("preview extracts metadata and stores the og:image in R2", async () => {
    const t = setup();
    const m = await maker(t);
    sitesMock({
      "https://myapp.com": { html: PAGE_HTML("MyApp — Invoices that pay themselves", { image: "/og.png", description: "Send invoices and get paid faster." }) },
      "https://myapp.com/og.png": { image: pngBytes(1200, 630) },
    });
    const res = await m.client.post("/maker/products/preview", { url: "http://www.myapp.com/?utm_source=x&ref=ph" });
    expect(res.status).toBe(200);
    expect(res.data.normalizedUrl).toBe("https://myapp.com");
    expect(res.data.title).toBe("MyApp");
    expect(res.data.tagline).toBe("Invoices that pay themselves");
    expect(res.data.description).toBe("Send invoices and get paid faster.");
    expect(res.data.images).toHaveLength(1);
    expect(res.data.images[0]).toMatchObject({ width: 1200, height: 630, source: "og" });
    expect(res.data.images[0].key).toMatch(/^img\/[a-f0-9]{32}\.png$/);
    expect(t.r2.objects.has(res.data.images[0].key)).toBe(true);
  });

  test("preview refuses links outside verified domains, private IPs and blocked domains", async () => {
    const t = setup();
    const m = await maker(t);
    const other = await m.client.post("/maker/products/preview", { url: "https://notmine.com" });
    expect(other.data.error.code).toBe("DOMAIN_NOT_VERIFIED");

    restore = mockFetch(() => new Response("x"), { "myapp.com": ["127.0.0.1"] });
    const priv = await m.client.post("/maker/products/preview", { url: "https://myapp.com" });
    expect(priv.data.error.code).toBe("FETCH_FAILED");
    restore();

    t.sqlite.run("INSERT INTO blocked_domains (hostname, reason) VALUES ('myapp.com', 'spam')");
    const blocked = await m.client.post("/maker/products/preview", { url: "https://app.myapp.com" });
    expect(blocked.data.error.code).toBe("BLOCKED_DOMAIN");
  });

  test("non-makers can't preview or publish", async () => {
    const t = setup();
    const u = await signUp(t);
    expect((await u.client.post("/maker/products/preview", { url: "https://x.com" })).data.error.code).toBe("DOMAIN_NOT_VERIFIED");
    expect((await new Client(t).post("/maker/products", {})).status).toBe(401);
  });

  test("publish → live product page, duplicate blocked, subdomain allowed, limits enforced", async () => {
    const t = setup();
    const m = await maker(t);
    sitesMock({ "https://myapp.com/og.png": { image: pngBytes() } });
    const created = await publish(m.client);
    expect(created.status).toBe(201);
    expect(created.data.slug).toBe("my-app");

    const page = await new Client(t).get("/products/my-app");
    expect(page.status).toBe(200);
    expect(page.data.descriptionHtml).toBe("<p>A <strong>great</strong> app.</p>");
    expect(page.data.categories.map((c: { slug: string }) => c.slug)).toEqual(["ai", "productivity"]);
    expect(page.data.hostname).toBe("myapp.com");
    expect(page.data.maker.username).toBe("maker");

    const dup = await publish(m.client, { url: "https://www.myapp.com/?utm_campaign=launch" });
    expect(dup.status).toBe(409);
    expect(dup.data.error).toMatchObject({ code: "DUPLICATE_URL", existing: "/p/my-app" });

    const sub = await publish(m.client, { url: "https://docs.myapp.com", title: "My App" });
    expect(sub.status).toBe(201);
    expect(sub.data.slug).toBe("my-app-2");

    const third = await publish(m.client, { url: "https://myapp.com/pro", title: "Pro" });
    expect(third.status).toBe(201);
    const fourth = await publish(m.client, { url: "https://myapp.com/max", title: "Max" });
    expect(fourth.status).toBe(429);
    expect(fourth.data.error.code).toBe("LIMIT_REACHED");
  });

  test("validation errors are reported per field", async () => {
    const t = setup();
    const m = await maker(t);
    const res = await publish(m.client, { tagline: "x".repeat(61), categories: [] });
    expect(res.status).toBe(400);
    expect(res.data.error.code).toBe("VALIDATION");
    expect(Object.keys(res.data.error.fields)).toEqual(expect.arrayContaining(["tagline", "categories"]));
  });

  test("edit keeps untouched fields, delete removes", async () => {
    const t = setup();
    const m = await maker(t);
    const { data } = await publish(m.client);
    const edit = await m.client.patch(`/maker/products/${data.id}`, { tagline: "New tagline", categories: ["design"] });
    expect(edit.status).toBe(200);
    const detail = await m.client.get(`/maker/products/${data.id}`);
    expect(detail.data.tagline).toBe("New tagline");
    expect(detail.data.feedbackMode).toBe("public");
    expect(detail.data.roadmapEnabled).toBe(true);
    expect(detail.data.categories.map((c: { slug: string }) => c.slug)).toEqual(["design"]);

    const stranger = await signUp(t);
    expect((await stranger.client.patch(`/maker/products/${data.id}`, { tagline: "hack" })).status).toBe(403);

    expect((await m.client.del(`/maker/products/${data.id}`)).status).toBe(200);
    expect((await new Client(t).get("/products/my-app")).status).toBe(404);
  });

  test("image upload: real type check, no SVG", async () => {
    const t = setup();
    const m = await maker(t);
    const svg = await m.client.req("POST", "/maker/uploads", { body: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', headers: { "content-type": "image/png" } });
    expect(svg.status).toBe(400);
    const png = await m.client.req("POST", "/maker/uploads", { body: pngBytes(800, 500), headers: { "content-type": "application/octet-stream" } });
    expect(png.status).toBe(201);
    expect(png.data).toMatchObject({ width: 800, height: 500 });
    const created = await publish(m.client, { images: [{ key: png.data.key }] });
    const detail = await new Client(t).get(`/products/${created.data.slug}`);
    expect(detail.data.image.key).toBe(png.data.key);
    expect(detail.data.image.url).toBe(`http://localhost:8787/${png.data.key}`);
    const img = await new Client(t).get(`/${png.data.key}`);
    expect(img.status).toBe(200);
    expect(img.headers.get("cache-control")).toContain("immutable");
    const bogus = await publish(m.client, { url: "https://myapp.com/b", images: [{ key: "img/00000000000000000000000000000000.png" }] });
    expect(bogus.status).toBe(400);
  });
});

describe("discovery", () => {
  async function seed(t: TestContext, n: number, category = "ai") {
    const m = await maker(t);
    t.sqlite.run("UPDATE user SET role = 'admin' WHERE id = ?", [m.id]); // admins skip posting limits
    for (let i = 0; i < n; i++) {
      const r = await publish(m.client, { url: `https://myapp.com/p${i}`, title: `Product ${i}`, categories: [category], description: i % 2 ? "Calendar planner" : "Invoice generator" });
      expect(r.status).toBe(201);
      t.sqlite.run("UPDATE products SET published_at = published_at - ? WHERE id = ?", [(n - i) * 60, r.data.id]);
    }
    return m;
  }

  test("visitors see only the newest N in a category; accounts can page through all", async () => {
    const t = setup({ VISITOR_CATEGORY_LIMIT: "5" } as never);
    await seed(t, 8);
    const visitor = new Client(t);
    const v = await visitor.get("/categories/ai/products");
    expect(v.data.items).toHaveLength(5);
    expect(v.data.items[0].title).toBe("Product 7");
    expect(v.data.limited).toBe(true);
    expect(v.data.nextCursor).toBeNull();

    const u = await signUp(t);
    const p1 = await u.client.get("/categories/ai/products");
    expect(p1.data.items).toHaveLength(8);
    expect(p1.data.limited).toBe(false);
    expect((await visitor.get(`/categories/ai/products?cursor=1.x`)).data.limited).toBe(true);
  });

  test("feed follows interests; onboarding needs 3 categories", async () => {
    const t = setup();
    const m = await maker(t);
    await publish(m.client, { url: "https://myapp.com/a", title: "Alpha", categories: ["finance"] });
    await publish(m.client, { url: "https://myapp.com/b", title: "Beta", categories: ["design", "ai"] });
    const u = await signUp(t);
    expect((await u.client.put("/me/interests", { categories: ["ai"] })).status).toBe(400);
    const set = await u.client.put("/me/interests", { categories: ["ai", "design", "games"] });
    expect(set.status).toBe(200);
    expect((await u.client.get("/me")).data.onboarded).toBe(true);
    const feed = await u.client.get("/feed");
    expect(feed.data.items.map((p: { title: string }) => p.title)).toEqual(["Beta"]);
    expect((await new Client(t).get("/feed")).status).toBe(401);
  });

  test("full-text search with filters", async () => {
    const t = setup();
    await seed(t, 4);
    const all = await new Client(t).get("/search?q=invoice");
    expect(all.data.items.map((p: { title: string }) => p.title).sort()).toEqual(["Product 0", "Product 2"]);
    const prefix = await new Client(t).get("/search?q=calend");
    expect(prefix.data.items).toHaveLength(2);
    const none = await new Client(t).get("/search?q=invoice&stage=launched");
    expect(none.data.items).toHaveLength(0);
    const weird = await new Client(t).get(`/search?q=${encodeURIComponent('"); DROP TABLE products; --')}`);
    expect(weird.status).toBe(200);
  });

  test("home, categories with counts, maker profile, sitemap", async () => {
    const t = setup();
    await seed(t, 3, "design");
    const home = await new Client(t).get("/home");
    expect(home.data.today).toHaveLength(3);
    expect(home.data.categories[0].slug).toBe("design");
    expect(home.data.categories[0].productCount).toBe(3);
    const cats = await new Client(t).get("/categories");
    expect(cats.data.items).toHaveLength(20);
    const profile = await new Client(t).get("/makers/maker");
    expect(profile.data.products).toHaveLength(3);
    const sitemap = await new Client(t).get("/sitemap");
    expect(sitemap.data.products).toHaveLength(3);
    expect(sitemap.data.makers).toEqual(["maker"]);
  });

  test("saves update counters and the saved list", async () => {
    const t = setup();
    const m = await maker(t);
    const { data } = await publish(m.client);
    const u = await signUp(t);
    expect((await u.client.put(`/me/saves/${data.id}`)).data.saveCount).toBe(1);
    expect((await u.client.put(`/me/saves/${data.id}`)).data.saveCount).toBe(1);
    expect((await u.client.get("/me/saves")).data.items).toHaveLength(1);
    const viewer = await u.client.post(`/products/${data.id}/view`);
    expect(viewer.data.viewer.saved).toBe(true);
    await u.client.del(`/me/saves/${data.id}`);
    expect((await new Client(t).get(`/products/${data.slug}`)).data.saveCount).toBe(0);
  });

  test("views and clicks are counted in batches", async () => {
    const t = setup();
    const m = await maker(t);
    const { data } = await publish(m.client);
    const v = new Client(t);
    for (let i = 0; i < 30; i++) await v.post(`/products/${data.id}/view`);
    await v.post(`/products/${data.id}/click`);
    await settle(t);
    // Counters are per isolate (module state); flush what's left like the cron does.
    await flushCounters(services(t.env).db);
    const row = t.sqlite.query("SELECT view_count, click_count FROM products WHERE id = ?").get(data.id) as { view_count: number; click_count: number };
    expect(row.view_count).toBe(30);
    expect(row.click_count).toBe(1);
  });
});
