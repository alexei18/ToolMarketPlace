import { describe, expect, test } from "bun:test";
import { runDigest } from "../src/jobs/digest";
import { services } from "../src/middleware";
import { Client, setup, signUp, verifyDomain, type TestContext } from "./helpers";

async function product(t: TestContext, overrides: Record<string, unknown> = {}) {
  const m = await signUp(t, { name: "Maker" });
  verifyDomain(t, m.id, "myapp.com");
  const res = await m.client.post("/maker/products", {
    url: "https://myapp.com",
    title: "My App",
    tagline: "Does the thing",
    description: "Text",
    categories: ["ai"],
    stage: "launched",
    pricing: "paid",
    feedbackMode: "public",
    roadmapEnabled: true,
    ...overrides,
  });
  expect(res.status).toBe(201);
  return { maker: m, id: res.data.id as string, slug: res.data.slug as string };
}

describe("perks", () => {
  test("visitors see perks without codes; claiming shows a unique code once per user", async () => {
    const t = setup();
    const p = await product(t);
    const put = await p.maker.client.put(`/maker/products/${p.id}/perks`, {
      perks: [
        { type: "unique_codes", title: "3 months Pro", codes: ["AAA-1", "AAA-2", "AAA-1"] },
        { type: "coupon", title: "20% off", sharedCode: "LAUNCH20", redeemUrl: "https://myapp.com/redeem", maxClaims: 1 },
      ],
    });
    expect(put.status).toBe(200);
    expect(put.data.items[0]).toMatchObject({ codesTotal: 2, codesLeft: 2 });

    const pub = await new Client(t).get(`/products/${p.slug}`);
    expect(pub.data.hasPerk).toBe(true);
    expect(pub.data.perks).toHaveLength(2);
    expect(JSON.stringify(pub.data)).not.toContain("AAA-1");
    expect(JSON.stringify(pub.data)).not.toContain("LAUNCH20");
    expect(JSON.stringify(pub.data)).not.toContain("/redeem");

    const [codesPerk, couponPerk] = pub.data.perks;
    expect((await new Client(t).post(`/perks/${codesPerk.id}/claim`)).status).toBe(401);

    const a = await signUp(t);
    const claim = await a.client.post(`/perks/${codesPerk.id}/claim`);
    expect(claim.status).toBe(201);
    expect(claim.data.code).toMatch(/^AAA-[12]$/);
    const again = await a.client.post(`/perks/${codesPerk.id}/claim`);
    expect(again.data).toMatchObject({ code: claim.data.code, alreadyClaimed: true });

    const b = await signUp(t);
    const c = await signUp(t);
    const [rb, rc] = await Promise.all([b.client.post(`/perks/${codesPerk.id}/claim`), c.client.post(`/perks/${codesPerk.id}/claim`)]);
    const statuses = [rb.status, rc.status].sort();
    expect(statuses).toEqual([201, 410]);
    expect(rb.data.code ?? rc.data.code).not.toBe(claim.data.code);

    const coupon = await a.client.post(`/perks/${couponPerk.id}/claim`);
    expect(coupon.data).toMatchObject({ code: "LAUNCH20", redeemUrl: "https://myapp.com/redeem" });
    expect((await b.client.post(`/perks/${couponPerk.id}/claim`)).data.error.code).toBe("PERK_UNAVAILABLE");

    const mine = await a.client.get("/me/perks");
    expect(mine.data.items.map((x: { code: string }) => x.code).sort()).toEqual([claim.data.code, "LAUNCH20"].sort());
    const viewer = await a.client.get(`/products/${p.id}/viewer`);
    expect(viewer.data.viewer.perks.filter((x: { claimed: boolean }) => x.claimed)).toHaveLength(2);

    const stats = await p.maker.client.get(`/maker/products/${p.id}/stats`);
    expect(stats.data.perkClaims).toBe(3);
  });

  test("expired or inactive perks can't be claimed; unverified users can't claim", async () => {
    const t = setup();
    const p = await product(t);
    await p.maker.client.put(`/maker/products/${p.id}/perks`, { perks: [{ type: "free_trial", title: "Trial", expiresAt: 1000, redeemUrl: "https://myapp.com/t" }] });
    const perkId = (await new Client(t).get(`/products/${p.slug}`)).data.perks[0].id;
    const u = await signUp(t);
    expect((await u.client.post(`/perks/${perkId}/claim`)).data.error.code).toBe("PERK_UNAVAILABLE");
    const unverified = await signUp(t, { verified: false });
    expect((await unverified.client.post(`/perks/${perkId}/claim`)).data.error.code).toBe("EMAIL_NOT_VERIFIED");
  });
});

describe("feedback", () => {
  test("public feedback, maker reply notifies the author, resolve", async () => {
    const t = setup();
    const p = await product(t);
    const u = await signUp(t);
    const fb = await u.client.post(`/products/${p.id}/feedback`, { type: "bug", body: "<b>Login</b> button does nothing" });
    expect(fb.status).toBe(201);
    expect(fb.data.isPublic).toBe(true);

    const list = await new Client(t).get(`/products/${p.slug}/feedback`);
    expect(list.data.items).toHaveLength(1);
    expect(list.data.items[0].body).toBe("<b>Login</b> button does nothing");

    expect((await p.maker.client.post(`/products/${p.id}/feedback`, { type: "idea", body: "self" })).status).toBe(403);
    expect((await u.client.post(`/feedback/${fb.data.id}/reply`, { reply: "not mine" })).status).toBe(403);

    const reply = await p.maker.client.post(`/feedback/${fb.data.id}/reply`, { reply: "Fixed in 1.2, thanks!" });
    expect(reply.status).toBe(200);
    const notes = await u.client.get("/me/notifications");
    expect(notes.data.items[0]).toMatchObject({ type: "feedback_reply", payload: { kind: "feedback_reply", reply: "Fixed in 1.2, thanks!", productSlug: p.slug } });
    expect((await u.client.get("/me")).data.unreadNotifications).toBe(1);
    await u.client.post("/me/notifications/read", {});
    expect((await u.client.get("/me")).data.unreadNotifications).toBe(0);

    expect((await p.maker.client.post(`/feedback/${fb.data.id}/resolve`, {})).data.resolvedAt).toBeGreaterThan(0);
    const open = await p.maker.client.get(`/products/${p.id}/feedback?filter=open`);
    expect(open.data.items).toHaveLength(0);
  });

  test("private feedback is only visible to the maker and its author; disabled feedback is refused", async () => {
    const t = setup();
    const p = await product(t, { feedbackMode: "private" });
    const u = await signUp(t);
    await u.client.post(`/products/${p.id}/feedback`, { type: "idea", body: "Dark mode please" });
    expect((await new Client(t).get(`/products/${p.id}/feedback`)).data.items).toHaveLength(0);
    expect((await (await signUp(t)).client.get(`/products/${p.id}/feedback`)).data.items).toHaveLength(0);
    expect((await u.client.get(`/products/${p.id}/feedback`)).data.items).toHaveLength(1);
    expect((await p.maker.client.get(`/products/${p.id}/feedback`)).data.items).toHaveLength(1);

    await p.maker.client.patch(`/maker/products/${p.id}`, { feedbackMode: "off" });
    expect((await u.client.post(`/products/${p.id}/feedback`, { type: "idea", body: "more" })).data.error.code).toBe("FEEDBACK_DISABLED");
  });
});

describe("roadmap", () => {
  test("idea → roadmap item, one vote per user, shipped notifies the feedback author", async () => {
    const t = setup();
    const p = await product(t);
    const u = await signUp(t);
    const fb = await u.client.post(`/products/${p.id}/feedback`, { type: "idea", body: "Export to CSV" });
    const item = await p.maker.client.post(`/products/${p.id}/roadmap`, { title: "CSV export", fromFeedbackId: fb.data.id });
    expect(item.status).toBe(201);
    expect(item.data.status).toBe("planned");

    expect((await u.client.put(`/roadmap/${item.data.id}/vote`)).data.voteCount).toBe(1);
    expect((await u.client.put(`/roadmap/${item.data.id}/vote`)).data.voteCount).toBe(1);
    const v2 = await signUp(t);
    expect((await v2.client.put(`/roadmap/${item.data.id}/vote`)).data.voteCount).toBe(2);
    expect((await v2.client.del(`/roadmap/${item.data.id}/vote`)).data.voteCount).toBe(1);
    expect((await new Client(t).put(`/roadmap/${item.data.id}/vote`)).status).toBe(401);

    const list = await u.client.get(`/products/${p.slug}/roadmap`);
    expect(list.data.items[0]).toMatchObject({ title: "CSV export", voteCount: 1, voted: true });
    expect((await new Client(t).get(`/products/${p.id}/feedback`)).data.items[0].roadmapItemId).toBe(item.data.id);

    await p.maker.client.patch(`/products/${p.id}/roadmap/${item.data.id}`, { status: "in_progress" });
    await p.maker.client.patch(`/products/${p.id}/roadmap/${item.data.id}`, { status: "shipped" });
    const notes = await u.client.get("/me/notifications");
    expect(notes.data.items.map((n: { type: string }) => n.type)).toEqual(["roadmap_shipped"]);
    expect(notes.data.items[0].payload.itemTitle).toBe("CSV export");
  });
});

describe("reports and moderation", () => {
  test("3 valid reports hide the product; new accounts don't count; admin restores and removes", async () => {
    const t = setup();
    const p = await product(t);
    const fresh = await signUp(t);
    const r0 = await fresh.client.post(`/products/${p.id}/report`, { reason: "spam" });
    expect(r0.data).toMatchObject({ counted: false, hidden: false });
    expect((await fresh.client.post(`/products/${p.id}/report`, { reason: "spam" })).data.error.code).toBe("ALREADY_REPORTED");

    const old = await Promise.all([1, 2, 3].map(() => signUp(t, { ageDays: 8 })));
    const res = [];
    for (const o of old) res.push((await o.client.post(`/products/${p.id}/report`, { reason: "scam", note: "fake" })).data);
    expect(res.map((r) => r.hidden)).toEqual([false, false, true]);
    expect((await new Client(t).get(`/products/${p.slug}`)).status).toBe(404);

    const admin = await signUp(t, { email: "admin@example.com" });
    expect((await old[0]!.client.get("/admin/review-queue")).status).toBe(403);
    const queue = await admin.client.get("/admin/review-queue");
    expect(queue.data.items).toHaveLength(1);
    expect(queue.data.items[0].reports).toHaveLength(4);

    expect((await admin.client.post(`/admin/products/${p.id}/restore`)).status).toBe(200);
    expect((await new Client(t).get(`/products/${p.slug}`)).status).toBe(200);
    const row = t.sqlite.query("SELECT valid_report_count FROM products WHERE id = ?").get(p.id) as { valid_report_count: number };
    expect(row.valid_report_count).toBe(0);

    const removed = await admin.client.post(`/admin/products/${p.id}/remove`);
    expect(removed.data).toMatchObject({ ok: true, makerBanned: false });
    expect((await new Client(t).get(`/products/${p.slug}`)).status).toBe(404);
    const makerNotes = await p.maker.client.get("/me/notifications");
    expect(makerNotes.data.items[0].payload.title).toBe("A product was removed");
  });

  test("makers are banned after 3 removed products; ban ends sessions and hides products", async () => {
    const t = setup({ PRODUCTS_PER_DAY: "10" } as never);
    const m = await signUp(t, { name: "Spammer" });
    verifyDomain(t, m.id, "spam.io");
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await m.client.post("/maker/products", { url: `https://spam.io/${i}`, title: `Spam ${i}`, tagline: "x", description: "x", categories: ["ai"], stage: "beta", pricing: "free" });
      ids.push(r.data.id);
    }
    const admin = await signUp(t, { email: "admin@example.com" });
    await admin.client.post(`/admin/products/${ids[0]}/remove`);
    await admin.client.post(`/admin/products/${ids[1]}/remove`);
    const third = await admin.client.post(`/admin/products/${ids[2]}/remove`);
    expect(third.data.makerBanned).toBe(true);
    expect((await m.client.get("/feed")).status).toBe(401);
    const status = t.sqlite.query("SELECT status FROM products WHERE id = ?").get(ids[3]!) as { status: string };
    expect(status.status).toBe("hidden");
  });

  test("admin manages categories and blocked domains", async () => {
    const t = setup();
    const admin = await signUp(t, { email: "admin@example.com" });
    const created = await admin.client.post("/admin/categories", { slug: "travel", name: "Travel" });
    expect(created.status).toBe(201);
    expect((await new Client(t).get("/categories")).data.items).toHaveLength(21);
    expect((await admin.client.patch(`/admin/categories/${created.data.id}`, { name: "Travel & Maps" })).data.name).toBe("Travel & Maps");
    expect((await admin.client.del(`/admin/categories/${created.data.id}`)).status).toBe(200);
    expect((await admin.client.post("/admin/blocked-domains", { hostname: "https://www.Spam.io" })).data.hostname).toBe("spam.io");
    expect((await admin.client.get("/admin/blocked-domains")).data.items).toHaveLength(1);
  });
});

describe("digest", () => {
  test("daily users get new products from their categories; nothing new → nothing sent", async () => {
    const t = setup();
    const { db } = services(t.env);
    const p = await product(t, { categories: ["ai"] });
    const daily = await signUp(t);
    await daily.client.put("/me/interests", { categories: ["ai", "design", "finance"] });
    await daily.client.patch("/me/settings", { digestFrequency: "daily" });
    const other = await signUp(t);
    await other.client.put("/me/interests", { categories: ["games", "design", "finance"] });
    await other.client.patch("/me/settings", { digestFrequency: "daily" });
    // Pretend both onboarded before the product launched.
    t.sqlite.run("UPDATE user SET onboarded_at = onboarded_at - 3600");
    t.sqlite.run("UPDATE products SET published_at = published_at - 60");
    t.sqlite.run("UPDATE product_categories SET published_at = published_at - 60");

    // Run "now" but pretend it's not a Monday: only the two daily users are due (the maker is weekly).
    let now = Date.now();
    while (new Date(now).getUTCDay() === 1) now += 3600_000;
    const r = await runDigest(t.env, db, now);
    expect(r.processed).toBe(2);
    expect(r.notified).toBe(1);
    const notes = await daily.client.get("/me/notifications");
    expect(notes.data.items[0].payload).toMatchObject({ kind: "digest", products: [{ slug: p.slug }] });
    expect((await other.client.get("/me/notifications")).data.items).toHaveLength(0);
    const again = await runDigest(t.env, db, now);
    expect(again.processed).toBe(0);
  });

  test("weekly users are processed on Mondays only", async () => {
    const t = setup();
    const { db } = services(t.env);
    await product(t);
    const weekly = await signUp(t);
    await weekly.client.put("/me/interests", { categories: ["ai", "design", "finance"] });
    t.sqlite.run("UPDATE user SET onboarded_at = onboarded_at - 3600");
    t.sqlite.run("UPDATE product_categories SET published_at = published_at - 60");
    let monday = Date.now();
    while (new Date(monday).getUTCDay() !== 1) monday += 86400_000;
    let notMonday = monday + 86400_000;
    // Products must be inside the weekly window for the future Monday.
    expect((await runDigest(t.env, db, notMonday)).processed).toBe(0);
    const r = await runDigest(t.env, db, monday);
    expect(r.processed).toBe(2); // the maker (no interests → nothing) and the weekly user
    expect(r.notified).toBe(1);
  });
});
