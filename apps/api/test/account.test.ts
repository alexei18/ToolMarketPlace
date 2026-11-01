import { describe, expect, test } from "bun:test";
import { EXPORT_LINK_HOURS } from "@tm/shared";
import { cleanup } from "../src/jobs/maintenance";
import { aggregateSignals } from "../src/jobs/ranking";
import { services } from "../src/middleware";
import { API, Client, settle, setup, signUp, verifyDomain, type TestContext } from "./helpers";

type Account = Awaited<ReturnType<typeof signUp>>;

async function publish(t: TestContext, maker: Account, host: string, feedbackMode: "public" | "private") {
  verifyDomain(t, maker.id, host);
  const res = await maker.client.post("/maker/products", {
    url: `https://${host}`,
    title: `App ${host}`,
    tagline: "Does the thing",
    description: "Text",
    categories: ["productivity"],
    stage: "launched",
    pricing: "free",
    feedbackMode,
    roadmapEnabled: true,
  });
  expect(res.status).toBe(201);
  return { id: res.data.id as string, slug: res.data.slug as string };
}

const LONG = "This is detailed feedback, long enough to count as a ranking signal.";

/**
 * A user who has done everything the app records: profile and first-touch source, interests, saves,
 * public and private feedback, a roadmap vote, a claimed perk, a report, a notification, a push
 * subscription, ranking signals, and as a maker a domain and a product others interacted with.
 */
async function busyUser(t: TestContext) {
  const other = await signUp(t, { name: "Other maker", ageDays: 30 });
  const pub = await publish(t, other, "public.com", "public");
  const priv = await publish(t, other, "private.com", "private");
  const perks = await other.client.put(`/maker/products/${pub.id}/perks`, { perks: [{ type: "unique_codes", title: "3 months Pro", codes: ["CODE-1"] }] });
  const perkId = perks.data.items[0].id as string;
  const item = await other.client.post(`/products/${pub.id}/roadmap`, { title: "CSV export" });

  const u = await signUp(t, { name: "Busy User", ageDays: 30 });
  t.sqlite.run("UPDATE user SET utm_source = 'tiktok', utm_campaign = 'launch', utm_content = 'clip-3' WHERE id = ?", [u.id]);
  expect((await u.client.put("/me/interests", { categories: ["productivity", "design", "ai"] })).status).toBe(200);
  expect((await u.client.put(`/me/saves/${pub.id}`)).status).toBe(200);
  const fbPublic = await u.client.post(`/products/${pub.id}/feedback`, { type: "idea", body: LONG });
  expect(fbPublic.status).toBe(201);
  expect((await u.client.post(`/products/${priv.id}/feedback`, { type: "bug", body: "Private note for the maker only." })).status).toBe(201);
  expect((await u.client.put(`/roadmap/${item.data.id}/vote`)).status).toBe(200);
  expect((await u.client.post(`/perks/${perkId}/claim`)).status).toBe(201);
  expect((await u.client.post(`/products/${priv.id}/report`, { reason: "spam", note: "Looks copied" })).status).toBe(201);
  expect((await other.client.post(`/feedback/${fbPublic.data.id}/reply`, { reply: "Thanks, on it." })).status).toBe(200);
  expect((await u.client.post("/me/push-subscriptions", { endpoint: "https://push.example.com/sub/1", keys: { p256dh: "P256DH-SECRET", auth: "AUTH-SECRET" } })).status).toBe(201);

  // The user is a maker too: their product gets a save and public feedback from someone else.
  const own = await publish(t, u, "busy.com", "public");
  const fan = await signUp(t, { ageDays: 30 });
  await fan.client.put(`/me/saves/${own.id}`);
  await fan.client.post(`/products/${own.id}/feedback`, { type: "praise", body: LONG });
  // A moderation decision about the user's product, which they contested.
  t.sqlite.run(
    "INSERT INTO moderation_decisions (id, target_type, product_id, user_id, action, trigger, automated, rule, facts, created_at, contest_body, contested_at) VALUES ('dec-1', 'product', ?, ?, 'hidden', 'reports', 1, 'spam', 'Three reports.', 1, 'Not spam, it is my only listing.', 2)",
    [own.id, u.id],
  );

  await settle(t);
  return { u, other, fan, pub, priv, own, perkId, itemId: item.data.id as string, publicFeedbackId: fbPublic.data.id as string };
}

/** Every (table, column) that holds a user id: foreign keys to `user`. */
function userColumns(t: TestContext): string[] {
  const tables = (t.sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name);
  return tables.flatMap((table) =>
    (t.sqlite.query(`PRAGMA foreign_key_list(\`${table}\`)`).all() as { table: string; from: string }[]).filter((fk) => fk.table === "user").map((fk) => `${table}.${fk.from}`),
  );
}

const rowsFor = (t: TestContext, column: string, userId: string) => {
  const [table, col] = column.split(".");
  return (t.sqlite.query(`SELECT count(*) AS n FROM \`${table}\` WHERE \`${col}\` = ?`).get(userId) as { n: number }).n;
};

async function exportOf(client: Client) {
  const made = await client.post("/me/export");
  expect(made.status).toBe(201);
  expect(made.data.url).toStartWith(`${API}/me/export/`);
  const path = made.data.url.slice(API.length);
  const file = await client.get(path);
  return { made, path, file };
}

describe("export my data", () => {
  test("contains every row tied to the user, and no secrets", async () => {
    const t = setup();
    const s = await busyUser(t);
    const { made, file } = await exportOf(s.u.client);
    expect(made.data.expiresAt - Math.floor(Date.now() / 1000)).toBeWithin(EXPORT_LINK_HOURS * 3600 - 5, EXPORT_LINK_HOURS * 3600 + 1);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-disposition")).toMatch(/^attachment; filename="tryworthy-data-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(file.headers.get("cache-control")).toBe("private, no-store");
    const data = file.data;

    // Each table that references the user maps to a section of the export with the same number of rows.
    // A new table with a user id fails here until the export covers it.
    const sections: Record<string, unknown[]> = {
      "session.user_id": data.signIn.sessions,
      "account.user_id": data.signIn.methods,
      "user_interests.user_id": data.interests,
      "domains.user_id": data.domains,
      "products.maker_id": data.products,
      "perk_claims.user_id": data.claimedPerks,
      "perk_codes.claimed_by": data.claimedPerks,
      "saves.user_id": data.saves,
      "feedback.user_id": data.feedback,
      "roadmap_votes.user_id": data.roadmapVotes,
      "reports.reporter_id": data.reports,
      "notifications.user_id": data.notifications,
      "push_subscriptions.user_id": data.pushSubscriptions,
      "product_signals.user_id": data.rankingSignals,
      "moderation_decisions.user_id": data.moderationDecisions,
    };
    // Set by admins when they act on moderation; it is not the acting admin's personal activity.
    const notExported = ["review_cases.resolved_by", "moderation_decisions.decided_by", "moderation_decisions.reversed_by", "moderation_decisions.contest_resolved_by"];
    expect(userColumns(t).sort()).toEqual([...Object.keys(sections), ...notExported].sort());
    for (const [column, section] of Object.entries(sections)) {
      const n = rowsFor(t, column, s.u.id);
      expect(n, column).toBeGreaterThan(0);
      expect(section.length, column).toBe(n);
    }

    expect(data.profile).toMatchObject({ id: s.u.id, email: s.u.email, name: "Busy User", emailVerified: true });
    expect(data.firstTouch).toEqual({ utmSource: "tiktok", utmCampaign: "launch", utmContent: "clip-3" });
    expect([...data.interests].sort()).toEqual(["ai", "design", "productivity"]);
    expect(data.saves).toEqual([expect.objectContaining({ product: s.pub.slug })]);
    expect(data.feedback.map((f: { public: boolean }) => f.public).sort()).toEqual([false, true]);
    expect(data.feedback.find((f: { public: boolean }) => f.public).makerReply).toBe("Thanks, on it.");
    expect(data.roadmapVotes).toEqual([expect.objectContaining({ itemId: s.itemId, item: "CSV export", product: s.pub.slug })]);
    expect(data.claimedPerks).toEqual([expect.objectContaining({ perkId: s.perkId, code: "CODE-1", product: s.pub.slug })]);
    expect(data.domains).toEqual([expect.objectContaining({ hostname: "busy.com" })]);
    expect(data.products).toEqual([expect.objectContaining({ id: s.own.id, slug: s.own.slug })]);
    expect(data.reports).toEqual([expect.objectContaining({ product: s.priv.slug, reason: "spam", note: "Looks copied" })]);
    expect(data.notifications[0]).toMatchObject({ type: "feedback_reply", payload: { reply: "Thanks, on it." } });
    expect(data.pushSubscriptions).toEqual([expect.objectContaining({ endpoint: "https://push.example.com/sub/1" })]);
    expect(data.rankingSignals.map((r: { type: string }) => r.type).sort()).toEqual(["feedback", "feedback", "perk_claim", "save", "vote"]);

    const text = JSON.stringify(data);
    const secrets = t.sqlite.query("SELECT password AS v FROM account WHERE user_id = ? UNION ALL SELECT token FROM session WHERE user_id = ?").all(s.u.id, s.u.id) as { v: string | null }[];
    for (const secret of [...secrets.map((r) => r.v).filter(Boolean), "P256DH-SECRET", "AUTH-SECRET"]) expect(text).not.toContain(secret!);
  });

  test("only the owner can download, and the link expires", async () => {
    const t = setup();
    const u = await signUp(t);
    const { path, file } = await exportOf(u.client);
    expect(file.status).toBe(200);
    expect((await new Client(t).get(path)).status).toBe(401);
    expect((await (await signUp(t)).client.get(path)).status).toBe(404);
    expect((await u.client.get("/me/export/../../img/x")).status).toBe(404);

    const key = [...t.r2.objects.keys()].find((k) => k.startsWith(`exports/${u.id}/`))!;
    t.r2.objects.get(key)!.uploaded = new Date(Date.now() - (EXPORT_LINK_HOURS * 3600 + 60) * 1000);
    expect((await u.client.get(path)).status).toBe(404);
  });
});

describe("delete my account", () => {
  test("needs DELETE typed to confirm", async () => {
    const t = setup();
    const u = await signUp(t);
    expect((await u.client.del("/me", { confirm: "delete" })).status).toBe(400);
    expect((await u.client.del("/me")).status).toBe(400);
    expect((await new Client(t).del("/me", { confirm: "DELETE" })).status).toBe(401);
    expect((await u.client.get("/me")).status).toBe(200);
  });

  test("leaves no row with the user id; public feedback stays as Deleted user", async () => {
    const t = setup();
    const s = await busyUser(t);
    const { db } = services(t.env);
    await aggregateSignals(db);
    await exportOf(s.u.client);

    // Files: one image only the user's product uses, one it shares with another product, and its OG card.
    t.sqlite.run("INSERT INTO product_images (id, product_id, r2_key, source, sort_order) VALUES ('i1', ?, 'img/own.webp', 'upload', 0), ('i2', ?, 'img/shared.webp', 'upload', 1), ('i3', ?, 'img/shared.webp', 'upload', 0)", [s.own.id, s.own.id, s.pub.id]);
    for (const key of ["img/own.webp", "img/shared.webp", `og/${s.own.id}-abc.png`]) await t.r2.put(key, "x");

    const saveCountBefore = (t.sqlite.query("SELECT save_count AS n FROM products WHERE id = ?").get(s.pub.id) as { n: number }).n;
    const dailyBefore = (t.sqlite.query("SELECT count(*) AS n FROM product_signal_daily").get() as { n: number }).n;
    expect(dailyBefore).toBeGreaterThan(0);

    const res = await s.u.client.del("/me", { confirm: "DELETE" });
    expect(res.status).toBe(200);
    expect([...s.u.client.cookies.keys()].some((k) => k.includes("session_token"))).toBe(false);
    expect(res.headers.getSetCookie().some((c) => /^tm_auth=;/.test(c))).toBe(true);
    expect((await s.u.client.get("/me")).status).toBe(401);
    await settle(t);

    // No row anywhere mentions the user's id or email.
    const tables = (t.sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((r) => r.name);
    for (const table of tables) {
      const text = JSON.stringify(t.sqlite.query(`SELECT * FROM \`${table}\``).all());
      expect(text.includes(s.u.id), table).toBe(false);
      expect(text.includes(s.u.email), table).toBe(false);
    }

    // Public feedback stays without an author; private feedback is gone.
    const left = t.sqlite.query("SELECT id, user_id, is_public FROM feedback WHERE product_id IN (?, ?)").all(s.pub.id, s.priv.id);
    expect(left).toEqual([{ id: s.publicFeedbackId, user_id: null, is_public: 1 }]);
    const shown = await new Client(t).get(`/products/${s.pub.id}/feedback`);
    expect(shown.data.items).toEqual([expect.objectContaining({ id: s.publicFeedbackId, author: null, makerReply: "Thanks, on it." })]);

    // The maker's product is removed with what others did on it.
    expect((await new Client(t).get(`/products/${s.own.slug}`)).status).toBeGreaterThanOrEqual(404);
    expect(t.sqlite.query("SELECT count(*) AS n FROM saves WHERE user_id = ?").get(s.fan.id)).toEqual({ n: 0 });
    expect(t.sqlite.query("SELECT count(*) AS n FROM feedback WHERE user_id = ?").get(s.fan.id)).toEqual({ n: 0 });

    // Counters on other products drop; the claimed code stays used; daily totals stay.
    expect(t.sqlite.query("SELECT save_count AS n FROM products WHERE id = ?").get(s.pub.id)).toEqual({ n: saveCountBefore - 1 });
    expect(t.sqlite.query("SELECT vote_count AS n FROM roadmap_items WHERE id = ?").get(s.itemId)).toEqual({ n: 0 });
    expect(t.sqlite.query("SELECT claimed_by, claimed_at IS NOT NULL AS used FROM perk_codes WHERE code = 'CODE-1'").get()).toEqual({ claimed_by: null, used: 1 });
    expect((t.sqlite.query("SELECT count(*) AS n FROM product_signal_daily").get() as { n: number }).n).toBeGreaterThan(0);

    // Moderation decisions stay for the monthly counts, without the user, the product or the contest text.
    expect(t.sqlite.query("SELECT user_id, product_id, contest_body FROM moderation_decisions WHERE id = 'dec-1'").get()).toEqual({ user_id: null, product_id: null, contest_body: null });

    // Only the deletion time is kept.
    const log =t.sqlite.query("SELECT * FROM account_deletions").all() as Record<string, unknown>[];
    expect(log).toHaveLength(1);
    expect(Object.keys(log[0]!).sort()).toEqual(["deleted_at", "id"]);

    // Files: export and OG card gone, the unshared image gone, the shared one kept.
    const keys = [...t.r2.objects.keys()];
    expect(keys.filter((k) => k.startsWith("exports/") || k.startsWith(`og/${s.own.id}`) || k === "img/own.webp")).toEqual([]);
    expect(keys).toContain("img/shared.webp");

    // The other accounts still work.
    expect((await s.other.client.get("/me")).status).toBe(200);
    expect((await s.fan.client.get("/me")).status).toBe(200);
  });
});

describe("retention cleanup", () => {
  test("deletes what is past its period and keeps the rest", async () => {
    const t = setup();
    const { db } = services(t.env);
    const s = await busyUser(t);
    const now = Date.now();
    const sec = Math.floor(now / 1000);
    const H = 3600;
    const D = 86400;

    t.sqlite.run("INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES ('s-old', ?, 't-old', ?, ?, ?)", [sec - 60, sec - 31 * D, sec - 31 * D, s.u.id]);
    t.sqlite.run(
      "INSERT INTO verification (id, identifier, value, expires_at, created_at) VALUES ('v-expired', 'a', 'x', ?, ?), ('v-old', 'b', 'x', ?, ?), ('v-fresh', 'c', 'x', ?, ?)",
      [sec - 60, sec - 2 * H, sec + 10 * H, sec - 25 * H, sec + 10 * H, sec - 1 * H],
    );
    t.sqlite.run(
      "INSERT INTO notifications (id, user_id, type, payload, read_at, created_at) VALUES ('n-read-old', ?, 'system', '{}', ?, ?), ('n-read-new', ?, 'system', '{}', ?, ?), ('n-unread-old', ?, 'system', '{}', NULL, ?)",
      [s.u.id, sec - 80 * D, sec - 91 * D, s.u.id, sec - D, sec - 10 * D, s.u.id, sec - 200 * D],
    );
    t.sqlite.run(
      "INSERT INTO product_signals (id, product_id, user_id, type, day, created_at) VALUES ('sig-old', ?, ?, 'click', ?, ?), ('sig-recent', ?, ?, 'click', ?, ?)",
      [s.pub.id, s.fan.id, Math.floor((sec - 31 * D) / D), sec - 31 * D, s.pub.id, s.fan.id, Math.floor((sec - 29 * D) / D), sec - 29 * D],
    );
    t.sqlite.run("INSERT INTO product_signal_daily (product_id, day, type, count) VALUES (?, ?, 'click', 1)", [s.pub.id, Math.floor((sec - 31 * D) / D)]);
    await t.r2.put(`exports/${s.u.id}/old.json`, "{}");
    await t.r2.put(`exports/${s.u.id}/new.json`, "{}");
    t.r2.objects.get(`exports/${s.u.id}/old.json`)!.uploaded = new Date(now - 25 * H * 1000);
    await t.r2.put("img/keep.webp", "x");
    t.r2.objects.get("img/keep.webp")!.uploaded = new Date(now - 400 * D * 1000);

    await cleanup(t.env, db, now);

    const ids = (sql: string) => (t.sqlite.query(sql).all() as { id: string }[]).map((r) => r.id).sort();
    expect(ids("SELECT id FROM session WHERE id = 's-old'")).toEqual([]);
    expect(ids("SELECT id FROM verification")).toEqual(["v-fresh"]);
    expect(ids("SELECT id FROM notifications WHERE id LIKE 'n-%'")).toEqual(["n-read-new", "n-unread-old"]);
    expect(ids("SELECT id FROM product_signals WHERE id LIKE 'sig-%'")).toEqual(["sig-recent"]);
    expect((t.sqlite.query("SELECT count(*) AS n FROM product_signals").get() as { n: number }).n).toBeGreaterThan(1);
    expect(t.sqlite.query("SELECT count(*) AS n FROM product_signal_daily WHERE day = ?").get(Math.floor((sec - 31 * D) / D))).toEqual({ n: 1 });
    const keys = [...t.r2.objects.keys()];
    expect(keys).not.toContain(`exports/${s.u.id}/old.json`);
    expect(keys).toContain(`exports/${s.u.id}/new.json`);
    expect(keys).toContain("img/keep.webp");
  });
});

describe("first-touch source (docs/PRELAUNCH.md)", () => {
  const row = (t: TestContext, id: string) => t.sqlite.query("SELECT utm_source, utm_campaign, utm_content FROM user WHERE id = ?").get(id);

  test("onboarding saves the sign-up link's utm params once, for new accounts only", async () => {
    const t = setup();
    const u = await signUp(t);
    const first = await u.client.post("/me/first-touch", { source: "tiktok", campaign: "launch", content: "clip-3" });
    expect(first.status).toBe(200);
    expect(first.data.saved).toBe(true);
    expect(row(t, u.id)).toEqual({ utm_source: "tiktok", utm_campaign: "launch", utm_content: "clip-3" });

    // The first source stays.
    expect((await u.client.post("/me/first-touch", { source: "instagram" })).data.saved).toBe(false);
    expect(row(t, u.id)).toEqual({ utm_source: "tiktok", utm_campaign: "launch", utm_content: "clip-3" });

    // Older accounts can't add one later; partial params are kept as sent.
    const old = await signUp(t, { ageDays: 2 });
    expect((await old.client.post("/me/first-touch", { source: "tiktok" })).data.saved).toBe(false);
    expect(row(t, old.id)).toEqual({ utm_source: null, utm_campaign: null, utm_content: null });
    const partial = await signUp(t);
    expect((await partial.client.post("/me/first-touch", { source: "youtube", campaign: null })).data.saved).toBe(true);
    expect(row(t, partial.id)).toEqual({ utm_source: "youtube", utm_campaign: null, utm_content: null });

    expect((await partial.client.post("/me/first-touch", {})).status).toBe(400);
    expect((await partial.client.post("/me/first-touch", { source: "x".repeat(101) })).status).toBe(400);
    expect((await new Client(t).post("/me/first-touch", { source: "tiktok" })).status).toBe(401);
  });
});
