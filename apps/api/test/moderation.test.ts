import { describe, expect, test } from "bun:test";
import { cleanup } from "../src/jobs/maintenance";
import { services } from "../src/middleware";
import { Client, WEB, settle, setup, signUp, verifyDomain, type TestContext } from "./helpers";

async function product(t: TestContext, host = "myapp.com", name = "Maker Person") {
  const m = await signUp(t, { name, ageDays: 30 });
  verifyDomain(t, m.id, host);
  const res = await m.client.post("/maker/products", {
    url: `https://${host}`,
    title: `App ${host}`,
    tagline: "Does the thing",
    description: "Text",
    categories: ["ai"],
    stage: "launched",
    pricing: "free",
  });
  expect(res.status).toBe(201);
  return { maker: m, id: res.data.id as string, slug: res.data.slug as string, title: `App ${host}` };
}

const admin = (t: TestContext) => signUp(t, { email: "admin@example.com", name: "Admin" });
const REPORT = { reason: "malware", explanation: "The download installs a browser extension without asking.", goodFaith: true };
const REMOVE = { rule: "malware", facts: "The installer adds software without clear consent." };

/** Hides a product with 3 counted member reports; returns the reporters. */
async function autoHide(t: TestContext, productId: string) {
  const reporters = await Promise.all([1, 2, 3].map(() => signUp(t, { ageDays: 8 })));
  for (const r of reporters) await r.client.post(`/products/${productId}/report`, { reason: "scam", note: "Takes money" });
  return reporters;
}

const emailsTo = (t: TestContext, to: string) => t.emails.filter((e) => e.includes(`to=${to} `));

describe("public reports", () => {
  test("work without an account, need good faith, and never hide the product", async () => {
    const t = setup();
    const p = await product(t);
    const visitor = new Client(t);

    expect((await visitor.post("/reports", { ...REPORT, url: `${WEB}/p/${p.slug}`, goodFaith: false })).status).toBe(400);
    expect((await visitor.post("/reports", { ...REPORT, url: `${WEB}/p/${p.slug}`, reason: "spam" })).status).toBe(400);
    expect((await visitor.post("/reports", { ...REPORT, url: `${WEB}/p/${p.slug}`, explanation: "short" })).status).toBe(400);
    const unknown = await visitor.post("/reports", { ...REPORT, url: "https://nowhere.example.org" });
    expect(unknown.status).toBe(400);
    expect(unknown.data.error.fields.url).toBeDefined();

    // A product page link, without an email: acknowledged on screen only.
    const a = await visitor.post("/reports", { ...REPORT, url: `${WEB}/p/${p.slug}/feedback` });
    expect(a.status).toBe(201);
    expect(a.data).toMatchObject({ product: { slug: p.slug }, emailed: false });
    expect(a.data.reference).toMatch(/^R-[A-Z0-9]{8}$/);
    // A page on the product's own website, with an email: confirmed by email too.
    const b = await visitor.post("/reports", { ...REPORT, reason: "ip", url: "https://www.myapp.com/pricing?utm_source=x", email: "Reporter@Example.com" });
    expect(b.status).toBe(201);
    expect(b.data.emailed).toBe(true);
    await settle(t);
    expect(emailsTo(t, "reporter@example.com")).toHaveLength(1);
    expect(emailsTo(t, "reporter@example.com")[0]).toContain(b.data.reference);

    const rows = t.sqlite.query("SELECT source, reporter_id, reporter_email, counts, good_faith, reason FROM reports ORDER BY created_at").all();
    expect(rows).toEqual([
      { source: "public", reporter_id: null, reporter_email: null, counts: 0, good_faith: 1, reason: "malware" },
      { source: "public", reporter_id: null, reporter_email: "reporter@example.com", counts: 0, good_faith: 1, reason: "ip" },
    ]);
    for (let i = 0; i < 4; i++) await visitor.post("/reports", { ...REPORT, url: `${WEB}/p/${p.slug}` });
    expect((await visitor.get(`/products/${p.slug}`)).status).toBe(200);

    // Open public reports put the product in the admin queue.
    const a1 = await admin(t);
    const queue = await a1.client.get("/admin/review-queue");
    expect(queue.data.items).toHaveLength(1);
    expect(queue.data.items[0].reports[0]).toMatchObject({ source: "public", reporter: null });
  });

  test("need Turnstile when it is configured; the member dialog keeps its own reasons", async () => {
    const t = setup();
    const p = await product(t);
    t.env.TURNSTILE_SECRET_KEY = "secret";
    const res = await new Client(t).post("/reports", { ...REPORT, url: `${WEB}/p/${p.slug}` });
    expect(res.data.error.code).toBe("TURNSTILE_FAILED");

    const t2 = setup();
    const p2 = await product(t2);
    const member = await signUp(t2, { ageDays: 8 });
    expect((await member.client.post(`/products/${p2.id}/report`, { reason: "malware" })).status).toBe(400);
    expect((await member.client.post(`/products/${p2.id}/report`, { reason: "scam" })).status).toBe(201);
  });
});

describe("statements of reasons", () => {
  test("an automatic hide tells the maker what, why, which rule, that it was automated, and how to contest", async () => {
    const t = setup();
    const p = await product(t);
    await autoHide(t, p.id);
    await settle(t);

    const { items } = (await p.maker.client.get("/me/decisions")).data;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ targetType: "product", action: "hidden", trigger: "reports", automated: true, rule: "scam", product: { id: p.id }, contest: null });
    expect(items[0].contestUntil).toBeGreaterThan(Math.floor(Date.now() / 1000) + 150 * 86400);
    const note = (await p.maker.client.get("/me/notifications")).data.items[0].payload;
    expect(note.title).toBe("A decision about your product");
    expect(note.href).toBe(`/dashboard/decisions#d-${items[0].id}`);
    expect(note.body).toContain(`Your product ${p.title} was hidden.`);
    expect(note.body).toContain("3 reports from established accounts");
    expect(note.body).toContain(`Rule: Scams and misleading listings (${WEB}/guidelines#not-allowed-in-listings)`);
    expect(note.body).toContain("This decision was made automatically.");
    expect(note.body).toContain("contest it once within 6 months");
    expect(emailsTo(t, p.maker.email).filter((e) => e.includes("A decision about your product"))).toHaveLength(1);
  });

  test("admin removal states the rule; reporters hear the outcome without the maker's details", async () => {
    const t = setup();
    const p = await product(t, "myapp.com", "Maker Person");
    const members = await autoHide(t, p.id);
    await new Client(t).post("/reports", { ...REPORT, url: `${WEB}/p/${p.slug}`, email: "pub@example.com" });
    const a = await admin(t);

    expect((await a.client.post(`/admin/products/${p.id}/remove`, { rule: "nope", facts: "x" })).status).toBe(400);
    expect((await a.client.post(`/admin/products/${p.id}/remove`, REMOVE)).status).toBe(200);
    await settle(t);

    const decided = t.sqlite.query("SELECT outcome, decided_at IS NOT NULL AS decided, decision_id IS NOT NULL AS linked FROM reports").all();
    expect(decided).toEqual(Array(4).fill({ outcome: "upheld", decided: 1, linked: 1 }));
    const removal = (await p.maker.client.get("/me/decisions")).data.items[0];
    expect(removal).toMatchObject({ action: "removed", trigger: "admin", automated: false, rule: "malware", facts: REMOVE.facts });

    const memberNote = (await members[0]!.client.get("/me/notifications")).data.items[0].payload;
    expect(memberNote.title).toBe(`Your report about ${p.title}`);
    expect(memberNote.body).toBe(`We reviewed your report about ${p.title}. The product was removed. Rule: Malware.`);
    const publicMail = emailsTo(t, "pub@example.com");
    expect(publicMail.at(-1)).toContain("The product was removed. Rule: Malware.");
    for (const text of [memberNote.body, ...publicMail]) {
      expect(text).not.toContain("Maker Person");
      expect(text).not.toContain(p.maker.email);
    }
  });

  test("restoring rejects the reports, reverses the hide and tells everyone", async () => {
    const t = setup();
    const p = await product(t);
    const members = await autoHide(t, p.id);
    const a = await admin(t);
    expect((await a.client.post(`/admin/products/${p.id}/restore`)).status).toBe(200);
    await settle(t);
    expect((await new Client(t).get(`/products/${p.slug}`)).status).toBe(200);
    expect((await p.maker.client.get("/me/decisions")).data.items[0].reversedAt).not.toBeNull();
    expect((await members[0]!.client.get("/me/notifications")).data.items[0].payload.body).toContain("found no breach of our rules");
  });
});

describe("contests", () => {
  test("once, by the affected user, within 6 months; they reach the queue with spike cases", async () => {
    const t = setup();
    const p = await product(t);
    await autoHide(t, p.id);
    const decision = (await p.maker.client.get("/me/decisions")).data.items[0];

    expect((await (await signUp(t)).client.post(`/me/decisions/${decision.id}/contest`, { body: "This product is mine and it is not a scam at all." })).status).toBe(404);
    expect((await p.maker.client.post(`/me/decisions/${decision.id}/contest`, { body: "short" })).status).toBe(400);
    expect((await p.maker.client.post(`/me/decisions/${decision.id}/contest`, { body: "The reports came from a competitor; here is my pricing page." })).status).toBe(201);
    const again = await p.maker.client.post(`/me/decisions/${decision.id}/contest`, { body: "Second try, with even more words in it." });
    expect(again.data.error.code).toBe("CONTEST_CLOSED");

    const { db } = services(t.env);
    await db.run(
      // A signal spike case on another product: contests and spikes share the queue.
      (await import("drizzle-orm")).sql`INSERT INTO review_cases (id, product_id, kind, details, created_at) VALUES ('case-1', ${p.id}, 'signal_spike', '{"total":10,"young":8,"windowHours":24}', 1)`,
    );
    const a = await admin(t);
    const queue = (await a.client.get("/admin/review-queue")).data;
    expect(queue.contests).toHaveLength(1);
    expect(queue.contests[0]).toMatchObject({ id: decision.id, user: { id: p.maker.id }, contest: { outcome: null } });
    expect(queue.cases).toHaveLength(1);

    const res = await a.client.post(`/admin/decisions/${decision.id}/contest`, { outcome: "reversed", response: "The reports were not credible." });
    expect(res.data).toMatchObject({ ok: true, sameAdmin: false });
    expect((await new Client(t).get(`/products/${p.slug}`)).status).toBe(200);
    const after = (await p.maker.client.get("/me/decisions")).data.items[0];
    expect(after.contest).toMatchObject({ outcome: "reversed", response: "The reports were not credible." });
    expect(after.reversedAt).not.toBeNull();
    expect((await p.maker.client.get("/me/notifications")).data.items[0].payload.title).toBe("Your contest was reviewed");
    expect((await a.client.post(`/admin/decisions/${decision.id}/contest`, { outcome: "upheld", response: "Changed my mind about it." })).data.error.code).toBe("CONTEST_CLOSED");
    expect((await a.client.get("/admin/review-queue")).data.contests).toHaveLength(0);
  });

  test("the same admin may answer, and it is recorded; old decisions can't be contested", async () => {
    const t = setup();
    const p = await product(t);
    const a = await admin(t);
    await a.client.post(`/admin/products/${p.id}/remove`, REMOVE);
    const d = (await p.maker.client.get("/me/decisions")).data.items[0];
    await p.maker.client.post(`/me/decisions/${d.id}/contest`, { body: "There is no installer at all, it is a web app." });
    const res = await a.client.post(`/admin/decisions/${d.id}/contest`, { outcome: "upheld", response: "We checked the download page again." });
    expect(res.data.sameAdmin).toBe(true);
    expect(t.sqlite.query("SELECT contest_resolved_by AS by, decided_by AS decided FROM moderation_decisions WHERE id = ?").get(d.id)).toEqual({ by: a.id, decided: a.id });
    expect((await new Client(t).get(`/products/${p.slug}`)).status).toBe(410);

    const p2 = await product(t, "other.com");
    await a.client.post(`/admin/products/${p2.id}/remove`, REMOVE);
    const old = (await p2.maker.client.get("/me/decisions")).data.items[0];
    t.sqlite.run("UPDATE moderation_decisions SET created_at = created_at - ? WHERE id = ?", [190 * 86400, old.id]);
    expect((await p2.maker.client.get("/me/decisions")).data.items[0].contestUntil).toBeNull();
    expect((await p2.maker.client.post(`/me/decisions/${old.id}/contest`, { body: "Please look at this again, it was a mistake." })).data.error.code).toBe("CONTEST_CLOSED");
  });
});

describe("account suspensions", () => {
  test("an admin ban gives a statement; the user signs in to a limited view and can contest once", async () => {
    const t = setup();
    const p = await product(t);
    const a = await admin(t);
    expect((await a.client.post(`/admin/users/${p.maker.id}/ban`, {})).status).toBe(400);
    expect((await a.client.post(`/admin/users/${p.maker.id}/ban`, { rule: "ranking", facts: "Saves came from twelve accounts created by the same person." })).status).toBe(200);
    await settle(t);
    // Sessions end; signing in again opens only the suspension page and decisions.
    expect((await p.maker.client.get("/me")).status).toBe(401);
    const c = new Client(t);
    expect((await c.post("/auth/sign-in/email", { email: p.maker.email, password: "correct horse battery" })).status).toBe(200);
    expect((await c.get("/me")).data.banned).toBe(true);
    expect((await c.get("/maker/products")).data.error.code).toBe("BANNED");
    expect((await new Client(t).get(`/products/${p.slug}`)).status).toBe(410);

    const { items, suspended } = (await c.get("/me/decisions")).data;
    expect(suspended).toBe(true);
    const account = items.find((d: { targetType: string }) => d.targetType === "account");
    const child = items.find((d: { targetType: string }) => d.targetType === "product");
    expect(account).toMatchObject({ action: "suspended", trigger: "admin", automated: false, rule: "ranking", parentId: null });
    expect(child).toMatchObject({ action: "hidden", trigger: "suspension", parentId: account.id, contestUntil: null, product: { id: p.id } });
    expect(emailsTo(t, p.maker.email).at(-1)).toContain("Your account was suspended.");

    expect((await c.post(`/me/decisions/${child.id}/contest`, { body: "Please restore my product, I did nothing wrong." })).data.error.code).toBe("CONTEST_CLOSED");
    expect((await c.post(`/me/decisions/${account.id}/contest`, { body: "Those accounts are my coworkers, not fake accounts." })).status).toBe(201);

    expect((await a.client.post(`/admin/decisions/${account.id}/contest`, { outcome: "reversed", response: "We confirmed they are separate people." })).status).toBe(200);
    expect(t.sqlite.query("SELECT banned_at FROM user WHERE id = ?").get(p.maker.id)).toEqual({ banned_at: null });
    expect((await new Client(t).get(`/products/${p.slug}`)).status).toBe(200);
    expect((t.sqlite.query("SELECT count(*) AS n FROM moderation_decisions WHERE reversed_at IS NULL").get() as { n: number }).n).toBe(0);
    expect((await c.get("/maker/products")).status).toBe(200);
  });

  test("automatic bans state why and are marked automated; unban lifts them", async () => {
    const t = setup({ PRODUCTS_PER_DAY: "10" } as never);
    const m = await signUp(t, { name: "Spammer" });
    verifyDomain(t, m.id, "spam.io");
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await m.client.post("/maker/products", { url: `https://spam.io/${i}`, title: `Spam ${i}`, tagline: "x", description: "x", categories: ["ai"], stage: "beta", pricing: "free" });
      ids.push(r.data.id);
    }
    const a = await admin(t);
    for (const id of ids.slice(0, 3)) await a.client.post(`/admin/products/${id}/remove`, { rule: "spam", facts: "Duplicate listing of the same product." });
    const account = t.sqlite.query("SELECT * FROM moderation_decisions WHERE target_type = 'account'").get() as Record<string, unknown>;
    expect(account).toMatchObject({ user_id: m.id, action: "suspended", trigger: "removed_products", automated: 1, rule: "repeated", decided_by: null, facts: "3 of your products were removed after review." });

    expect((await a.client.post(`/admin/users/${m.id}/unban`)).status).toBe(200);
    expect(t.sqlite.query("SELECT status FROM products WHERE id = ?").get(ids[3]!)).toEqual({ status: "live" });
    expect(t.sqlite.query("SELECT reversed_by FROM moderation_decisions WHERE id = ?").get(account.id as string)).toEqual({ reversed_by: a.id });
  });
});

describe("admin lists and monthly counts", () => {
  test("filters reports and decisions, and exports monthly counts as CSV", async () => {
    const t = setup();
    const p = await product(t);
    await autoHide(t, p.id);
    await new Client(t).post("/reports", { ...REPORT, url: `${WEB}/p/${p.slug}` });
    const a = await admin(t);
    await a.client.post(`/admin/products/${p.id}/remove`, REMOVE);

    const publicOnly = (await a.client.get("/admin/reports?source=public")).data.items;
    expect(publicOnly).toHaveLength(1);
    expect(publicOnly[0]).toMatchObject({ source: "public", reason: "malware", outcome: "upheld", product: { id: p.id, status: "removed" } });
    expect((await a.client.get("/admin/reports?status=open")).data.items).toHaveLength(0);
    expect((await a.client.get("/admin/reports?reason=scam")).data.items).toHaveLength(3);
    const month = new Date().toISOString().slice(0, 7);
    expect((await a.client.get(`/admin/reports?month=${month}`)).data.items).toHaveLength(4);
    expect((await a.client.get("/admin/reports?month=2001-01")).data.items).toHaveLength(0);

    expect((await a.client.get("/admin/decisions?automated=1")).data.items.map((d: { action: string }) => d.action)).toEqual(["hidden"]);
    expect((await a.client.get("/admin/decisions?automated=0")).data.items[0]).toMatchObject({ action: "removed", decidedBy: { id: a.id }, user: { id: p.maker.id } });
    expect((await a.client.get("/admin/decisions?target=account")).data.items).toHaveLength(0);
    expect((await p.maker.client.get("/admin/decisions")).status).toBe(403);

    const csv = await a.client.get("/admin/moderation/monthly.csv");
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const lines = (csv.data as string).trim().split("\n");
    expect(lines[0]).toBe("month,metric,breakdown,count");
    expect(lines).toContain(`${month},reports,member/scam,3`);
    expect(lines).toContain(`${month},reports,public/malware,1`);
    expect(lines).toContain(`${month},decisions,product/hidden/reports/automated,1`);
    expect(lines).toContain(`${month},decisions,product/removed/admin/manual,1`);
  });
});

describe("reporter email retention", () => {
  test("the email on a public report is cleared 6 months after the decision", async () => {
    const t = setup();
    const p = await product(t);
    await new Client(t).post("/reports", { ...REPORT, url: `${WEB}/p/${p.slug}`, email: "keep@example.com" });
    await new Client(t).post("/reports", { ...REPORT, url: `${WEB}/p/${p.slug}`, email: "old@example.com" });
    await new Client(t).post("/reports", { ...REPORT, url: `${WEB}/p/${p.slug}`, email: "open@example.com" });
    const now = Math.floor(Date.now() / 1000);
    t.sqlite.run("UPDATE reports SET outcome = 'rejected', decided_at = ? WHERE reporter_email = 'keep@example.com'", [now - 150 * 86400]);
    t.sqlite.run("UPDATE reports SET outcome = 'rejected', decided_at = ? WHERE reporter_email = 'old@example.com'", [now - 200 * 86400]);
    await cleanup(t.env, services(t.env).db);
    const left = (t.sqlite.query("SELECT reporter_email AS e FROM reports WHERE reporter_email IS NOT NULL ORDER BY e").all() as { e: string }[]).map((r) => r.e);
    expect(left).toEqual(["keep@example.com", "open@example.com"]);
  });
});
