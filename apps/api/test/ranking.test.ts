import { afterEach, describe, expect, test } from "bun:test";
import { STAFF_PICK_DAYS, isoWeek, signalDay, weekIndex, weekStart, type SignalType } from "@tm/shared";
import { runDigest } from "../src/jobs/digest";
import { runRanking } from "../src/jobs/ranking";
import { weekArchive } from "../src/lib/archive";
import { services } from "../src/middleware";
import { Client, mockFetch, settle, setup, signUp, verifyDomain, type TestContext } from "./helpers";

const LONG = "Plans your week from your calendar and tasks, and moves whatever you didn't finish over to tomorrow.";

let restoreFetch: (() => void) | null = null;
afterEach(() => {
  restoreFetch?.();
  restoreFetch = null;
});

/** Product links answer 200 unless their path is listed in `down` (404). */
function links(down: string[] = []) {
  restoreFetch = mockFetch((url) => new Response("ok", { status: down.includes(url.pathname) ? 404 : 200 }));
}

/**
 * A maker (an admin, so no posting limits and access to staff picks) and live products that meet every
 * quality condition: a long description, a tagline, an image, a working link.
 */
async function catalog(t: TestContext, specs: { title: string; categories?: string[]; extra?: Record<string, unknown> }[]) {
  const m = await signUp(t, { name: "Maker", ageDays: 30 });
  t.sqlite.run("UPDATE user SET role = 'admin' WHERE id = ?", [m.id]);
  verifyDomain(t, m.id, "example.app");
  const ids: Record<string, string> = {};
  const slugs: Record<string, string> = {};
  for (const [i, s] of specs.entries()) {
    const r = await m.client.post("/maker/products", {
      url: `https://example.app/p${i}`,
      title: s.title,
      tagline: "Does the thing",
      description: LONG,
      categories: s.categories ?? ["productivity"],
      stage: "launched",
      pricing: "free",
      feedbackMode: "public",
      roadmapEnabled: true,
      ...s.extra,
    });
    expect(r.status).toBe(201);
    t.sqlite.run("INSERT INTO product_images (id, product_id, r2_key, width, height, source, sort_order) VALUES (?, ?, 'img/x.webp', 1600, 1000, 'upload', 0)", [`img_${r.data.id}`, r.data.id]);
    ids[s.title] = r.data.id;
    slugs[s.title] = r.data.slug;
  }
  return { maker: m, ids, slugs };
}

const now = () => Math.floor(Date.now() / 1000);

/** Moves a product's launch `hours` into the past. */
function launched(t: TestContext, id: string, hours: number) {
  const at = now() - Math.round(hours * 3600);
  t.sqlite.run("UPDATE products SET published_at = ? WHERE id = ?", [at, id]);
  t.sqlite.run("UPDATE product_categories SET published_at = ? WHERE product_id = ?", [at, id]);
}

let fans = 0;
/** An account inserted directly (fixture signals don't go through the API). */
function fan(t: TestContext, ageDays = 30): string {
  const id = `fan${++fans}`;
  t.sqlite.run("INSERT INTO user (id, name, email, email_verified, created_at, updated_at, digest_frequency) VALUES (?, ?, ?, 1, ?, ?, 'off')", [
    id,
    id,
    `${id}@fans.test`,
    now() - ageDays * 86400,
    now(),
  ]);
  return id;
}

let signals = 0;
/** A fixture signal recorded `hoursAgo`. */
function signal(t: TestContext, productId: string, userId: string, type: SignalType, hoursAgo = 1) {
  const at = now() - Math.round(hoursAgo * 3600);
  t.sqlite.run("INSERT INTO product_signals (id, product_id, user_id, type, day, created_at) VALUES (?, ?, ?, ?, ?, ?)", [`sig${++signals}`, productId, userId, type, signalDay(at), at]);
}

/** Daily counts for days before yesterday, as earlier job runs would have written them. */
function pastAggregates(t: TestContext) {
  t.sqlite.run(
    `INSERT INTO product_signal_daily (product_id, day, type, count)
     SELECT product_id, day, type, count(*) FROM product_signals GROUP BY product_id, day, type
     ON CONFLICT (product_id, day, type) DO UPDATE SET count = excluded.count`,
  );
}

const rank = (t: TestContext) => runRanking(services(t.env).db);
const titles = (res: { data: { items: { title: string }[] } }) => res.data.items.map((p) => p.title);

describe("Top this week and Trending", () => {
  test("Top orders by weighted signals of 7 days, plus the staff pick bonus, minus valid reports", async () => {
    const t = setup();
    links();
    const { maker, ids, slugs } = await catalog(t, [{ title: "Saved twice" }, { title: "Claim and click" }, { title: "Staff pick" }, { title: "Reported" }, { title: "Quiet" }]);
    launched(t, ids["Quiet"]!, 30); // oldest: loses the tie with nobody, sorts after positive scores
    const [a, b, c] = [fan(t), fan(t), fan(t)];
    signal(t, ids["Saved twice"]!, a, "save", 100); // 3 days ago: still this week
    signal(t, ids["Saved twice"]!, b, "save"); // 3 + 3 = 6
    signal(t, ids["Claim and click"]!, a, "perk_claim");
    signal(t, ids["Claim and click"]!, a, "click"); // 4 + 1 = 5
    for (const u of [a, b, c]) signal(t, ids["Reported"]!, u, "save"); // 9 − 10 = −1
    t.sqlite.run("UPDATE products SET valid_report_count = 1 WHERE id = ?", [ids["Reported"]!]);
    signal(t, ids["Quiet"]!, a, "click", 8 * 24); // 8 days ago: outside the week
    pastAggregates(t);
    expect((await maker.client.put(`/admin/products/${ids["Staff pick"]}/staff-pick`, { note: "Our favourite planner" })).status).toBe(200); // 15

    await rank(t);
    const top = await new Client(t).get("/categories/productivity/products");
    expect(titles(top)).toEqual(["Staff pick", "Saved twice", "Claim and click", "Quiet", "Reported"]);
    expect(top.data.items[0]).toMatchObject({ staffPick: true });
    expect(top.data.items.some((p: { justLaunched?: boolean }) => p.justLaunched)).toBe(false); // every new launch is already on the page
    expect((await new Client(t).get(`/products/${slugs["Staff pick"]}`)).data.staffPickNote).toBe("Our favourite planner");
    expect(JSON.stringify(top.data)).not.toMatch(/score/i);
  });

  test("Trending favors recent signals relative to age; signals older than 48 h don't count", async () => {
    const t = setup();
    links();
    const { ids } = await catalog(t, [{ title: "Older, busier" }, { title: "Brand new" }, { title: "Old click" }]);
    launched(t, ids["Older, busier"]!, 40);
    launched(t, ids["Brand new"]!, 2);
    launched(t, ids["Old click"]!, 100);
    for (let i = 0; i < 4; i++) signal(t, ids["Older, busier"]!, fan(t), "save", 5); // 12 ÷ 42^1.5 ≈ 0.044
    signal(t, ids["Brand new"]!, fan(t), "save", 1); // 3 ÷ 4^1.5 = 0.375
    signal(t, ids["Old click"]!, fan(t), "click", 60); // outside 48 h
    pastAggregates(t);

    await rank(t);
    expect(titles(await new Client(t).get("/categories/productivity/products?sort=trending"))).toEqual(["Brand new", "Older, busier"]);
    expect(titles(await new Client(t).get("/categories/productivity/products"))).toEqual(["Older, busier", "Brand new", "Old click"]);
  });

  test("a second run with nothing new writes nothing", async () => {
    const t = setup();
    links();
    const { ids } = await catalog(t, [{ title: "One" }, { title: "Two" }]);
    signal(t, ids["One"]!, fan(t), "save");
    const { db } = services(t.env);
    const at = Date.now();
    expect((await runRanking(db, at)).productsUpdated).toBe(2);
    expect((await runRanking(db, at)).productsUpdated).toBe(0);
  });
});

describe("Just launched slot", () => {
  async function shelf(t: TestContext, newHoursAgo: number) {
    const specs = [...Array.from({ length: 7 }, (_, i) => ({ title: `Old ${i}` })), { title: "Fresh" }];
    const { ids } = await catalog(t, specs);
    const f = fan(t);
    for (let i = 0; i < 7; i++) {
      launched(t, ids[`Old ${i}`]!, 72 + i);
      signal(t, ids[`Old ${i}`]!, f, "click"); // 1 point each; ties go to the newer launch
    }
    launched(t, ids["Fresh"]!, newHoursAgo); // 0 points: last in the regular order
    pastAggregates(t);
    await rank(t);
  }

  test("every 5th card in Top is a quality launch from the last 48 h that isn't on the page", async () => {
    const t = setup({ VISITOR_CATEGORY_LIMIT: "6" } as never);
    links();
    await shelf(t, 1);
    const top = await new Client(t).get("/categories/productivity/products");
    expect(titles(top)).toEqual(["Old 0", "Old 1", "Old 2", "Old 3", "Fresh", "Old 4"]);
    expect(top.data.items[4]).toMatchObject({ justLaunched: true });
    expect(top.data.items.filter((p: { justLaunched?: boolean }) => p.justLaunched)).toHaveLength(1);
    expect(top.data).toMatchObject({ limited: true, nextCursor: null, resumeCursor: "5" });
    // Trending and New have no slot.
    expect((await new Client(t).get("/categories/productivity/products?sort=new")).data.items.some((p: { justLaunched?: boolean }) => p.justLaunched)).toBe(false);
  });

  test("without a launch from the last 48 h the regular order fills the slot", async () => {
    const t = setup({ VISITOR_CATEGORY_LIMIT: "6" } as never);
    links();
    await shelf(t, 50);
    expect(titles(await new Client(t).get("/categories/productivity/products"))).toEqual(["Old 0", "Old 1", "Old 2", "Old 3", "Old 4", "Old 5"]);
  });
});

describe("self-signals", () => {
  test("a maker's own saves, clicks, claims and votes don't move their product", async () => {
    const t = setup();
    links();
    const { maker, ids } = await catalog(t, [{ title: "Maker's own" }, { title: "Liked by a fan" }]);
    const own = ids["Maker's own"]!;
    const perks = await maker.client.put(`/maker/products/${own}/perks`, { perks: [{ type: "free_trial", title: "30 days free" }] });
    const item = await maker.client.post(`/products/${own}/roadmap`, { title: "Dark mode" });
    await maker.client.put(`/me/saves/${own}`);
    await maker.client.post(`/products/${own}/click`);
    expect((await maker.client.post(`/perks/${perks.data.items[0].id}/claim`)).status).toBe(201);
    await maker.client.put(`/roadmap/${item.data.id}/vote`); // would be 3 + 1 + 4 + 1 = 9 if they counted
    const f = await signUp(t, { ageDays: 4 });
    await f.client.put(`/me/saves/${ids["Liked by a fan"]}`); // 3
    await settle(t);
    expect(t.sqlite.query("SELECT count(*) AS n FROM product_signals WHERE product_id = ?").get(own)).toEqual({ n: 0 });

    await rank(t);
    expect(titles(await new Client(t).get("/categories/productivity/products"))).toEqual(["Liked by a fan", "Maker's own"]);
  });
});

describe("quality conditions", () => {
  test("Top and Trending only show products that meet them; New shows every live product", async () => {
    const t = setup();
    links(["/p3"]);
    const { maker, ids } = await catalog(t, [{ title: "Complete" }, { title: "No image" }, { title: "Short text" }, { title: "Dead link" }]);
    t.sqlite.run("DELETE FROM product_images WHERE product_id = ?", [ids["No image"]!]);
    await maker.client.patch(`/maker/products/${ids["Short text"]}`, { description: "**Too** short." });
    for (const id of Object.values(ids)) signal(t, id, fan(t), "save");

    await rank(t); // first failed check: the link gets a second chance
    expect(titles(await new Client(t).get("/categories/productivity/products"))).toContain("Dead link");
    await rank(t);
    expect(titles(await new Client(t).get("/categories/productivity/products"))).toEqual(["Complete"]);
    expect(titles(await new Client(t).get("/categories/productivity/products?sort=trending"))).toEqual(["Complete"]);
    expect(titles(await new Client(t).get("/categories/productivity/products?sort=new"))).toHaveLength(4);

    const check = async (title: string) => (await maker.client.get(`/maker/products/${ids[title]}`)).data;
    expect((await check("Complete")).quality).toEqual({ link: true, image: true, description: true, tagline: true, noOpenReview: true });
    expect((await check("No image")).quality.image).toBe(false);
    expect((await check("Short text")).quality.description).toBe(false);
    expect((await check("Dead link")).quality.link).toBe(false);
    expect(JSON.stringify(await check("Complete"))).not.toMatch(/score/i);
  });

  test("an open counting report keeps a product out of Top and puts it in the admin queue", async () => {
    const t = setup();
    links();
    const { maker, ids } = await catalog(t, [{ title: "Reported once" }, { title: "Fine" }]);
    const reporter = await signUp(t, { ageDays: 8 });
    expect((await reporter.client.post(`/products/${ids["Reported once"]}/report`, { reason: "spam" })).data).toMatchObject({ counted: true, hidden: false });
    await rank(t);
    expect(titles(await new Client(t).get("/categories/productivity/products"))).toEqual(["Fine"]);
    const queue = await maker.client.get("/admin/review-queue");
    expect(queue.data.items.map((i: { product: { title: string; status: string } }) => [i.product.title, i.product.status])).toEqual([["Reported once", "live"]]);

    await maker.client.post(`/admin/products/${ids["Reported once"]}/restore`); // dismiss
    await rank(t);
    expect(titles(await new Client(t).get("/categories/productivity/products"))).toHaveLength(2);
  });
});

describe("spike check", () => {
  test("mostly-new accounts in 24 h open a case: still visible, out of Top until resolved", async () => {
    const t = setup();
    links();
    const { maker, ids, slugs } = await catalog(t, [{ title: "Spiky" }, { title: "Steady" }]);
    for (let i = 0; i < 10; i++) signal(t, ids["Spiky"]!, fan(t, 4), "click", 3); // 10 points, all from 4-day-old accounts
    signal(t, ids["Steady"]!, fan(t), "save"); // 3 points

    expect((await rank(t)).casesOpened).toBe(1);
    expect(titles(await new Client(t).get("/categories/productivity/products"))).toEqual(["Steady"]);
    expect((await new Client(t).get(`/products/${slugs["Spiky"]}`)).status).toBe(200);
    expect(titles(await new Client(t).get("/categories/productivity/products?sort=new"))).toContain("Spiky");

    const queue = await maker.client.get("/admin/review-queue");
    expect(queue.data.cases).toHaveLength(1);
    expect(queue.data.cases[0]).toMatchObject({ kind: "signal_spike", details: { total: 10, young: 10 }, product: { title: "Spiky" } });
    expect((await rank(t)).casesOpened).toBe(0); // one open case is enough

    expect((await maker.client.post(`/admin/cases/${queue.data.cases[0].id}/resolve`)).status).toBe(200);
    expect((await rank(t)).casesOpened).toBe(0); // cooldown after resolving
    expect(titles(await new Client(t).get("/categories/productivity/products"))).toEqual(["Spiky", "Steady"]);
  });

  test("a few signals or established accounts don't open a case", async () => {
    const t = setup();
    links();
    const { ids } = await catalog(t, [{ title: "Few" }, { title: "Popular" }]);
    for (let i = 0; i < 9; i++) signal(t, ids["Few"]!, fan(t, 4), "click");
    for (let i = 0; i < 12; i++) signal(t, ids["Popular"]!, fan(t, i < 6 ? 4 : 30), "click"); // exactly half young
    expect((await rank(t)).casesOpened).toBe(0);
  });
});

describe("filters", () => {
  test("AI-powered, platform, pricing, stage and has-perk narrow every view", async () => {
    const t = setup();
    links();
    const { maker, ids } = await catalog(t, [
      { title: "AI app", extra: { hasAi: true, platforms: ["web", "ios"] } },
      { title: "Paid beta", extra: { pricing: "paid", stage: "beta" } },
      { title: "With perk" },
    ]);
    await maker.client.put(`/maker/products/${ids["With perk"]}/perks`, { perks: [{ type: "free_trial", title: "30 days free" }] });
    await rank(t);
    const list = async (q: string) => titles(await new Client(t).get(`/categories/productivity/products?${q}`));
    expect(await list("sort=new&ai=1")).toEqual(["AI app"]);
    expect(await list("platform=ios")).toEqual(["AI app"]);
    expect(await list("sort=new&pricing=paid&stage=beta")).toEqual(["Paid beta"]);
    expect(await list("sort=new&perk=1")).toEqual(["With perk"]);
    expect((await new Client(t).get("/categories/productivity/products?platform=linux")).status).toBe(400);
  });
});

describe("staff picks", () => {
  test("admins add and remove picks; picks expire after STAFF_PICK_DAYS", async () => {
    const t = setup();
    links();
    const { maker, ids, slugs } = await catalog(t, [{ title: "Pick me" }]);
    const id = ids["Pick me"]!;
    const slug = slugs["Pick me"]!;
    const member = await signUp(t);
    expect((await member.client.put(`/admin/products/${id}/staff-pick`, { note: "Nice" })).status).toBe(403);
    expect((await maker.client.put(`/admin/products/${id}/staff-pick`, { note: "" })).status).toBe(400);
    expect((await maker.client.put(`/admin/products/${slug}/staff-pick`, { note: "Nice" })).status).toBe(200); // by slug too
    expect((await new Client(t).get(`/products/${slug}`)).data).toMatchObject({ staffPick: true, staffPickNote: "Nice" });
    expect((await maker.client.get("/admin/staff-picks")).data.items).toHaveLength(1);

    t.sqlite.run("UPDATE products SET staff_pick_at = staff_pick_at - ? WHERE id = ?", [STAFF_PICK_DAYS * 86400 + 1, id]);
    expect((await new Client(t).get(`/products/${slug}`)).data).toMatchObject({ staffPick: false, staffPickNote: null });
    expect((await maker.client.get("/admin/staff-picks")).data.items).toHaveLength(0);

    await maker.client.put(`/admin/products/${id}/staff-pick`, { note: "Again" });
    expect((await maker.client.del(`/admin/products/${id}/staff-pick`)).status).toBe(200);
    expect((await new Client(t).get(`/products/${slug}`)).data.staffPick).toBe(false);
  });
});

describe("digest by Top this week", () => {
  test("weekly users get one notification per category, best first", async () => {
    const t = setup();
    links();
    const { ids } = await catalog(t, [{ title: "Less liked" }, { title: "Most liked" }, { title: "Design pick", categories: ["design"] }, { title: "Unfinished" }]);
    t.sqlite.run("DELETE FROM product_images WHERE product_id = ?", [ids["Unfinished"]!]); // fails the quality conditions
    for (let i = 0; i < 3; i++) signal(t, ids["Most liked"]!, fan(t), "save");
    signal(t, ids["Less liked"]!, fan(t), "click");
    for (const id of Object.values(ids)) launched(t, id, 1);
    await rank(t);

    const reader = await signUp(t);
    await reader.client.put("/me/interests", { categories: ["productivity", "design", "finance"] });
    t.sqlite.run("UPDATE user SET onboarded_at = onboarded_at - 7200 WHERE id = ?", [reader.id]);
    let monday = Date.now();
    while (new Date(monday).getUTCDay() !== 1) monday += 86400_000;
    const r = await runDigest(t.env, services(t.env).db, monday);
    expect(r.notified).toBe(2); // productivity and design; finance has nothing

    const notes = (await reader.client.get("/me/notifications")).data.items.map((n: { payload: { category: { slug: string }; products: { title: string }[] } }) => [
      n.payload.category.slug,
      n.payload.products.map((p) => p.title),
    ]);
    expect(notes).toContainEqual(["productivity", ["Most liked", "Less liked"]]);
    expect(notes).toContainEqual(["design", ["Design pick"]]);
  });
});

describe("/new", () => {
  test("lists every live launch of the last 7 days across categories; category New keeps older ones", async () => {
    const t = setup();
    const { ids } = await catalog(t, [{ title: "Today" }, { title: "Design, yesterday", categories: ["design"] }, { title: "Last month" }]);
    launched(t, ids["Today"]!, 1);
    launched(t, ids["Design, yesterday"]!, 24);
    launched(t, ids["Last month"]!, 24 * 30);
    expect(titles(await new Client(t).get("/products?sort=new"))).toEqual(["Today", "Design, yesterday"]);
    expect(titles(await new Client(t).get("/categories/productivity/products?sort=new"))).toEqual(["Today", "Last month"]);
  });
});

describe("weekly archives", () => {
  /** Moves a product's launch to `at` (Unix seconds). */
  const launchAt = (t: TestContext, id: string, at: number) => launched(t, id, (now() - at) / 3600);
  /** A fixture signal at `at` (Unix seconds). */
  const signalAt = (t: TestContext, id: string, type: SignalType, at: number) => signal(t, id, fan(t), type, (now() - at) / 3600);

  test("rank a completed week's quality launches by that week's signals and link the previous archived week", async () => {
    const t = setup();
    links();
    // W has an archive, W-1 has too few launches, W-2 has an archive; W+1 is complete too, so its signals are final.
    const w = weekIndex(now()) - 2;
    const day = (week: number, d: number) => weekStart(week) + d * 86400 + 3600;
    const { ids } = await catalog(t, [
      { title: "Saved" },
      { title: "Clicked" },
      { title: "Quiet" },
      { title: "Unfinished" },
      { title: "Design", categories: ["design"] },
      { title: "W-1 a" },
      { title: "W-1 b" },
      { title: "W-2 a" },
      { title: "W-2 b" },
      { title: "W-2 c" },
    ]);
    t.sqlite.run("DELETE FROM product_images WHERE product_id = ?", [ids["Unfinished"]!]); // fails the quality conditions
    for (const [title, at] of [["Saved", day(w, 0)], ["Clicked", day(w, 1)], ["Quiet", day(w, 6)], ["Unfinished", day(w, 2)], ["Design", day(w, 2)]] as const) launchAt(t, ids[title]!, at);
    for (const title of ["W-1 a", "W-1 b"]) launchAt(t, ids[title]!, day(w - 1, 3));
    for (const title of ["W-2 a", "W-2 b", "W-2 c"]) launchAt(t, ids[title]!, day(w - 2, 3));
    signalAt(t, ids["Saved"]!, "save", day(w, 1));
    signalAt(t, ids["Saved"]!, "save", day(w, 2));
    signalAt(t, ids["Clicked"]!, "click", day(w, 3));
    // The week after doesn't count, however busy it was.
    for (let i = 0; i < 10; i++) signalAt(t, ids["Clicked"]!, "click", day(w + 1, 1));
    pastAggregates(t);
    await rank(t);

    const slug = isoWeek(w).slug;
    const res = await new Client(t).get(`/categories/productivity/weeks/${slug}`);
    expect(res.status).toBe(200);
    expect(res.data.category).toEqual({ slug: "productivity", name: "Productivity" });
    expect(res.data.week).toEqual({ slug, year: isoWeek(w).year, week: isoWeek(w).week });
    expect(titles(res)).toEqual(["Saved", "Clicked", "Quiet"]);
    expect(res.data.previous).toEqual({ slug: isoWeek(w - 2).slug, year: isoWeek(w - 2).year, week: isoWeek(w - 2).week });

    const older = await new Client(t).get(`/categories/productivity/weeks/${isoWeek(w - 2).slug}`);
    expect(titles(older).sort()).toEqual(["W-2 a", "W-2 b", "W-2 c"]);
    expect(older.data.previous).toBeNull();

    // Too few launches, a category without launches that week, the current week, bad input: 404.
    for (const path of [`productivity/weeks/${isoWeek(w - 1).slug}`, `design/weeks/${slug}`, `productivity/weeks/${isoWeek(w + 2).slug}`, "productivity/weeks/2026-W44", `nope/weeks/${slug}`]) {
      expect((await new Client(t).get(`/categories/${path}`)).status, path).toBe(404);
    }
    // A week that hasn't ended has no archive, whatever it holds.
    const { db } = services(t.env);
    const catId = t.sqlite.query("SELECT id FROM categories WHERE slug = 'productivity'").get() as { id: string };
    expect(await weekArchive(db, t.env, catId.id, w, weekStart(w) + 3 * 86400)).toBeNull();

    const sitemap = await new Client(t).get("/sitemap/weeks");
    expect(sitemap.data.items).toEqual([{ path: `/c/productivity/week/${slug}` }, { path: `/c/productivity/week/${isoWeek(w - 2).slug}` }]);

    // Not generated in pre-launch.
    t.env.PRELAUNCH = "true";
    expect((await new Client(t).get(`/categories/productivity/weeks/${slug}`)).status).toBe(404);
    expect((await new Client(t).get("/sitemap/weeks")).data.items).toEqual([]);
  });
});
