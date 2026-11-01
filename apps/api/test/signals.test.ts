import { describe, expect, test } from "bun:test";
import { signalDay } from "@tm/shared";
import { aggregateSignals } from "../src/jobs/ranking";
import { services } from "../src/middleware";
import { Client, settle, setup, signUp, verifyDomain, type TestContext } from "./helpers";

async function product(t: TestContext, host = "myapp.com") {
  const m = await signUp(t, { name: "Maker", ageDays: 30 });
  const domainId = verifyDomain(t, m.id, host);
  const res = await m.client.post("/maker/products", {
    url: `https://${host}`,
    title: "My App",
    tagline: "Does the thing",
    description: "Text",
    categories: ["productivity"],
    stage: "launched",
    pricing: "free",
    feedbackMode: "public",
    roadmapEnabled: true,
  });
  expect(res.status).toBe(201);
  return { maker: m, id: res.data.id as string, slug: res.data.slug as string, domainId };
}

/** An account that passes every rule: confirmed email, older than 3 days, not the maker. */
const member = (t: TestContext) => signUp(t, { ageDays: 4 });

function signals(t: TestContext, productId: string): { type: string; user_id: string; day: number }[] {
  return t.sqlite.query("SELECT type, user_id, day FROM product_signals WHERE product_id = ? ORDER BY type, day").all(productId) as never;
}

const count = (t: TestContext, productId: string, type: string) => signals(t, productId).filter((s) => s.type === type).length;

/** Moves every signal one day back, as if it had been recorded yesterday. */
const yesterday = (t: TestContext) => t.sqlite.run("UPDATE product_signals SET day = day - 1");

describe("signal eligibility", () => {
  test("only confirmed accounts older than 3 days that aren't the maker count", async () => {
    const t = setup();
    const p = await product(t);
    const ok = await member(t);
    const unverified = await signUp(t, { verified: false, ageDays: 10 });
    const young = await signUp(t, { ageDays: 2 });
    for (const u of [ok, unverified, young, p.maker]) {
      expect((await u.client.put(`/me/saves/${p.id}`)).status).toBe(200);
      expect((await u.client.post(`/products/${p.id}/click`)).status).toBe(204);
    }
    await settle(t);
    expect(signals(t, p.id)).toEqual([
      { type: "click", user_id: ok.id, day: signalDay(Math.floor(Date.now() / 1000)) },
      { type: "save", user_id: ok.id, day: signalDay(Math.floor(Date.now() / 1000)) },
    ]);
    // The user-facing counter still counts every save; only the signal is filtered.
    expect((await new Client(t).get(`/products/${p.slug}`)).data.saveCount).toBe(4);
  });

  test("an account that owns the product's verified domain doesn't count", async () => {
    const t = setup();
    const p = await product(t);
    const owner = await member(t);
    t.sqlite.run("UPDATE domains SET user_id = ? WHERE id = ?", [owner.id, p.domainId]);
    await owner.client.put(`/me/saves/${p.id}`);
    await settle(t);
    expect(signals(t, p.id)).toEqual([]);

    // Once the domain is no longer verified, the same account counts.
    t.sqlite.run("UPDATE domains SET verified_at = NULL WHERE id = ?", [p.domainId]);
    await owner.client.post(`/products/${p.id}/click`);
    await settle(t);
    expect(count(t, p.id, "click")).toBe(1);
  });

  test("visitors' clicks are counted for stats but are not signals", async () => {
    const t = setup();
    const p = await product(t);
    expect((await new Client(t).post(`/products/${p.id}/click`)).status).toBe(204);
    await settle(t);
    expect(signals(t, p.id)).toEqual([]);
  });

  test("feedback counts only from 30 characters", async () => {
    const t = setup();
    const p = await product(t);
    const a = await member(t);
    const b = await member(t);
    expect((await a.client.post(`/products/${p.id}/feedback`, { type: "idea", body: "x".repeat(29) })).status).toBe(201);
    expect((await b.client.post(`/products/${p.id}/feedback`, { type: "idea", body: `  ${"y".repeat(30)}  ` })).status).toBe(201);
    await settle(t);
    expect(signals(t, p.id).map((s) => [s.type, s.user_id])).toEqual([["feedback", b.id]]);
  });
});

describe("duplicate signals", () => {
  test("a save counts once per user and product, even after unsaving on a later day", async () => {
    const t = setup();
    const p = await product(t);
    const u = await member(t);
    await u.client.put(`/me/saves/${p.id}`);
    await u.client.put(`/me/saves/${p.id}`);
    await settle(t);
    yesterday(t);
    await u.client.del(`/me/saves/${p.id}`);
    await u.client.put(`/me/saves/${p.id}`);
    await settle(t);
    expect(count(t, p.id, "save")).toBe(1);
  });

  test("perk claims count once per user and product, whatever the number of perks", async () => {
    const t = setup();
    const p = await product(t);
    const put = await p.maker.client.put(`/maker/products/${p.id}/perks`, {
      perks: [
        { type: "free_trial", title: "30 days free" },
        { type: "coupon", title: "20% off", sharedCode: "LAUNCH20" },
      ],
    });
    const [first, second] = put.data.items as { id: string }[];
    const u = await member(t);
    expect((await u.client.post(`/perks/${first!.id}/claim`)).status).toBe(201);
    await settle(t);
    yesterday(t);
    expect((await u.client.post(`/perks/${second!.id}/claim`)).status).toBe(201);
    await settle(t);
    expect(count(t, p.id, "perk_claim")).toBe(1);
  });

  test("clicks, feedback and votes count once per user, product and day", async () => {
    const t = setup();
    const p = await product(t);
    const items = await Promise.all(["CSV export", "Dark mode"].map((title) => p.maker.client.post(`/products/${p.id}/roadmap`, { title })));
    const u = await member(t);
    const body = "This would be a must-have with a CSV export.";
    for (let i = 0; i < 2; i++) {
      await u.client.post(`/products/${p.id}/click`);
      await u.client.post(`/products/${p.id}/feedback`, { type: "idea", body });
      await u.client.put(`/roadmap/${items[i]!.data.id}/vote`);
    }
    await settle(t);
    expect(signals(t, p.id).map((s) => s.type)).toEqual(["click", "feedback", "vote"]);

    // A new day: each type counts once more.
    yesterday(t);
    await u.client.post(`/products/${p.id}/click`);
    await u.client.post(`/products/${p.id}/feedback`, { type: "bug", body });
    await u.client.del(`/roadmap/${items[0]!.data.id}/vote`);
    await u.client.put(`/roadmap/${items[0]!.data.id}/vote`);
    await settle(t);
    expect(count(t, p.id, "click")).toBe(2);
    expect(count(t, p.id, "feedback")).toBe(2);
    expect(count(t, p.id, "vote")).toBe(2);
  });
});

describe("daily aggregation", () => {
  test("counts today and yesterday per product and type, and is idempotent", async () => {
    const t = setup();
    const p = await product(t);
    const users = await Promise.all([member(t), member(t), member(t)]);
    for (const u of users) await u.client.put(`/me/saves/${p.id}`);
    await settle(t);
    t.sqlite.run("UPDATE product_signals SET day = day - 5 WHERE user_id = ?", [users[2]!.id]); // outside the window
    await users[0]!.client.post(`/products/${p.id}/click`);
    await settle(t);

    const { db } = services(t.env);
    expect(await aggregateSignals(db)).toBe(2);
    const today = signalDay(Math.floor(Date.now() / 1000));
    const daily = () => t.sqlite.query("SELECT day, type, count FROM product_signal_daily WHERE product_id = ? ORDER BY type").all(p.id);
    expect(daily()).toEqual([
      { day: today, type: "click", count: 1 },
      { day: today, type: "save", count: 2 },
    ]);

    // Nothing changed: nothing is rewritten.
    expect(await aggregateSignals(db)).toBe(0);

    const late = await member(t);
    await late.client.post(`/products/${p.id}/click`);
    await settle(t);
    expect(await aggregateSignals(db)).toBe(1);
    expect(daily()).toContainEqual({ day: today, type: "click", count: 2 });
  });
});

describe("AI and platform fields", () => {
  test("default to no AI and web, can be changed, and reject unknown platforms", async () => {
    const t = setup();
    const p = await product(t);
    expect((await new Client(t).get(`/products/${p.slug}`)).data).toMatchObject({ hasAi: false, platforms: ["web"] });

    expect((await p.maker.client.patch(`/maker/products/${p.id}`, { hasAi: true, platforms: ["web", "ios", "api"] })).status).toBe(200);
    expect((await new Client(t).get(`/products/${p.slug}`)).data).toMatchObject({ hasAi: true, platforms: ["web", "ios", "api"] });

    for (const platforms of [["web", "linux"], [], ["web", "web"]]) {
      expect((await p.maker.client.patch(`/maker/products/${p.id}`, { platforms })).status).toBe(400);
    }
  });
});
