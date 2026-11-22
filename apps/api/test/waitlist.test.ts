import { describe, expect, test } from "bun:test";
import { TERMS_VERSION } from "@tm/shared";
import { cleanup } from "../src/jobs/maintenance";
import { forgetLaunchState } from "../src/lib/prelaunch";
import { processWaitlistEmails, signToken } from "../src/lib/waitlist";
import { services } from "../src/middleware";
import { API, Client, mockFetch, settle, setup, signUp, verifyDomain } from "./helpers";

type T = ReturnType<typeof setup>;

const signUpAs = (t: T, email: string) =>
  new Client(t).post("/auth/sign-up/email", { email, password: "correct horse battery", name: "Someone", acceptedTerms: TERMS_VERSION });

const join = (t: T, input: Record<string, unknown>) => new Client(t).post("/waitlist", { role: "explorer", ...input });

interface Row {
  id: string;
  email: string;
  role: string;
  interests: string;
  product_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  found_via: string | null;
  ref_code: string;
  referred_by: string | null;
  confirmed_at: number | null;
  confirmation_queued: number;
  confirmation_sent_at: number | null;
  invited_at: number | null;
  unsubscribed_at: number | null;
}
const rows = (t: T) => t.sqlite.query("SELECT * FROM waitlist ORDER BY created_at, id").all() as Row[];
const row = (t: T, email: string) => t.sqlite.query("SELECT * FROM waitlist WHERE email = ?").get(email) as Row | null;
const emailsTo = (t: T, email: string) => t.emails.filter((e) => e.includes(`to=${email} `));
const linkIn = (mail: string, path: string) => mail.match(new RegExp(`${path}\\?t=([^\\s]+)`))?.[1] ?? null;

const joinAs = (t: T, email: string, input: Record<string, unknown> = {}) => join(t, { email, ...input });
const nowSec = () => Math.floor(Date.now() / 1000);
/** A sign-up left pending from the double opt-in era (before 2026-11-22). */
const addPending = (t: T, email: string) =>
  t.sqlite.run("INSERT INTO waitlist (id, email, role, ref_code, created_at) VALUES (?, ?, 'explorer', ?, 1)", [`p_${email.replace(/\W/g, "")}`, email, `pc${email.length}x`]);

describe("waitlist mode", () => {
  test("WAITLIST runs pre-launch until the Launch time is recorded in D1", async () => {
    const t = setup({ WAITLIST: "true", MAKER_ACCESS_DATE: "2026-12-01", LAUNCH_DATE: "YYYY-MM-DD" });
    expect((await new Client(t).get("/site")).data).toEqual({ prelaunch: true, makerAccessDate: "2026-12-01", launchDate: null });

    t.sqlite.run("UPDATE site_state SET launched_at = 1 WHERE id = 1");
    forgetLaunchState(t.env);
    expect((await new Client(t).get("/site")).data.prelaunch).toBe(false);
    expect((await new Client(t).get("/home")).data.prelaunch).toBe(false);

    const off = setup({ WAITLIST: "false" });
    expect((await new Client(off).get("/site")).data.prelaunch).toBe(false);
  });

  test("only admins and invited makers can create an account during the waitlist", async () => {
    const t = setup({ WAITLIST: "true" });
    const blocked = await signUpAs(t, "someone@example.com");
    expect(blocked.status).toBe(403);
    expect(blocked.data.code).toBe("WAITLIST_ONLY");

    expect((await signUpAs(t, "Admin@Example.com")).status).toBe(200);

    const add = (id: string, email: string, role: string, invitedAt: number | null) =>
      t.sqlite.run("INSERT INTO waitlist (id, email, role, ref_code, confirmed_at, invited_at, created_at) VALUES (?, ?, ?, ?, 1, ?, 1)", [id, email, role, `code${id}`, invitedAt]);
    add("w1", "maker@example.com", "maker", null);
    add("w2", "invited@example.com", "maker", 2);
    add("w3", "explorer@example.com", "explorer", 2);
    expect((await signUpAs(t, "maker@example.com")).status).toBe(403);
    expect((await signUpAs(t, "explorer@example.com")).status).toBe(403);
    expect((await signUpAs(t, "Invited@example.com")).status).toBe(200);

    t.sqlite.run("UPDATE site_state SET launched_at = 1 WHERE id = 1");
    forgetLaunchState(t.env);
    expect((await signUpAs(t, "someone@example.com")).status).toBe(200);
  });

  test("the public magic link endpoint is closed", async () => {
    const t = setup({ WAITLIST: "true" });
    expect((await new Client(t).post("/auth/sign-in/magic-link", { email: "admin@example.com" })).status).toBe(404);
  });
});

describe("joining the waitlist", () => {
  test("single opt-in: the sign-up counts at once and gets one welcome email; the same email twice keeps one row and the same answer", async () => {
    const t = setup({ WAITLIST: "true", LAUNCH_DATE: "2026-12-08" });
    const first = await join(t, { email: " Ana@Example.com ", interests: ["c_ai"] });
    const r = row(t, "ana@example.com")!;
    expect(first.data).toEqual({ ok: true, refCode: r.ref_code });
    expect(r.confirmed_at).not.toBeNull();
    expect(r.confirmation_sent_at).not.toBeNull();
    const mail = emailsTo(t, "ana@example.com")[0]!;
    expect(mail).toContain("Thanks for joining the Tryworthy waitlist");
    expect(mail).toContain("You're on the list.");
    expect(mail).toContain("On launch day (December 8, 2026) we'll email you the top picks in your categories.");
    expect(mail).toContain(`/?ref=${r.ref_code}`);
    expect(mail).toContain("/waitlist/unsubscribe?t=");
    expect(mail).not.toContain("/waitlist/confirm");

    expect((await join(t, { email: "ana@example.com", role: "maker" })).data).toEqual(first.data);
    expect(rows(t)).toHaveLength(1);
    expect(row(t, "ana@example.com")!.role).toBe("explorer");
    expect(t.emails).toHaveLength(1);
  });

  test("a sign-up still pending from double opt-in joins with its latest answers when submitted again", async () => {
    const t = setup({ WAITLIST: "true" });
    addPending(t, "old@example.com");
    expect((await join(t, { email: "old@example.com", role: "maker" })).status).toBe(200);
    expect(row(t, "old@example.com")).toMatchObject({ role: "maker", confirmation_queued: 0 });
    expect(row(t, "old@example.com")!.confirmed_at).not.toBeNull();
    expect(emailsTo(t, "old@example.com")).toHaveLength(1);
    expect(emailsTo(t, "old@example.com")[0]).toContain("You get access a week before launch.");
  });

  test("an invalid email is refused and stores nothing", async () => {
    const t = setup({ WAITLIST: "true" });
    for (const email of ["not-an-email", "a@b", "", "x".repeat(250) + "@example.com"]) {
      const res = await join(t, { email });
      expect(res.status).toBe(400);
      expect(res.data.error.code).toBe("VALIDATION");
    }
    expect((await join(t, { email: "a@example.com", role: "admin" })).status).toBe(400);
    expect((await join(t, { email: "a@example.com", interests: ["c_ai", "c_design", "c_health", "c_finance", "c_education", "c_travel"] })).status).toBe(400);
    expect((await join(t, { email: "a@example.com", role: "maker", interests: ["c_ai", "c_design"] })).status).toBe(400);
    expect(rows(t)).toHaveLength(0);
    expect(t.emails).toHaveLength(0);
  });

  test("stores the role's optional fields, keeping only known categories and a valid product link", async () => {
    const t = setup({ WAITLIST: "true" });
    await join(t, { email: "e@example.com", interests: ["c_ai", "c_nope"], foundVia: "tiktok" });
    await join(t, { email: "m@example.com", role: "maker", interests: ["c_design"], productUrl: "WWW.MyApp.com/?utm_source=x" });
    await join(t, { email: "m2@example.com", role: "maker", productUrl: "not a url" });
    expect(row(t, "e@example.com")).toMatchObject({ interests: '["c_ai"]', found_via: "tiktok", product_url: null });
    expect(row(t, "m@example.com")).toMatchObject({ interests: '["c_design"]', product_url: "https://myapp.com" });
    expect(row(t, "m2@example.com")!.product_url).toBeNull();
  });

  test("closed after launch", async () => {
    const t = setup({ WAITLIST: "false" });
    expect((await join(t, { email: "a@example.com" })).status).toBe(410);
  });
});

describe("confirmation links sent before single opt-in", () => {
  test("confirming shows the role, the share code and the dates", async () => {
    const t = setup({ WAITLIST: "true", MAKER_ACCESS_DATE: "2026-12-01", LAUNCH_DATE: "2026-12-08" });
    await joinAs(t, "m@example.com", { role: "maker" });
    const r = row(t, "m@example.com")!;
    const res = await new Client(t).post("/waitlist/confirm", { token: await signToken(t.env, "confirm", r.id, nowSec() + 600) });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ role: "maker", hasInterests: false, refCode: r.ref_code, referrals: 0, makerAccessDate: "2026-12-01", launchDate: "2026-12-08" });
  });

  test("an expired or tampered link is refused and the sign-up stays unconfirmed", async () => {
    const t = setup({ WAITLIST: "true" });
    addPending(t, "a@example.com");
    const r = row(t, "a@example.com")!;
    const expired = await signToken(t.env, "confirm", r.id, nowSec() - 1);
    const res = await new Client(t).post("/waitlist/confirm", { token: expired });
    expect(res.status).toBe(410);

    const good = await signToken(t.env, "confirm", r.id, nowSec() + 600);
    const tampered = good.replace(/^[^.]+/, "01aaaaaaaaaaaaaaaaaaaaaaaa");
    expect((await new Client(t).post("/waitlist/confirm", { token: tampered })).status).toBe(404);
    // An unsubscribe token can't confirm.
    const unsub = await signToken(t.env, "unsubscribe", r.id, 0);
    expect((await new Client(t).post("/waitlist/confirm", { token: unsub })).status).toBe(404);
    expect(row(t, "a@example.com")!.confirmed_at).toBeNull();
  });
});

describe("unsubscribing", () => {
  test("from the page or with one click; unsubscribed people get no invites", async () => {
    const t = setup({ WAITLIST: "true" });
    await joinAs(t, "a@example.com", { role: "maker" });
    await joinAs(t, "b@example.com", { role: "maker" });
    const token = await signToken(t.env, "unsubscribe", row(t, "a@example.com")!.id, 0);
    expect((await new Client(t).post("/waitlist/unsubscribe", { token })).status).toBe(200);
    expect(row(t, "a@example.com")!.unsubscribed_at).not.toBeNull();
    // Joining again doesn't undo the unsubscribe: anyone can type an address.
    await joinAs(t, "a@example.com", { role: "maker" });
    expect(row(t, "a@example.com")!.unsubscribed_at).not.toBeNull();

    // RFC 8058: the mail app posts a form body to the List-Unsubscribe URL.
    const tokenB = await signToken(t.env, "unsubscribe", row(t, "b@example.com")!.id, 0);
    const oneClick = await t.app.fetch(
      new Request(`${API}/waitlist/unsubscribe?t=${tokenB}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" }),
      t.env,
      { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext,
    );
    expect(oneClick.status).toBe(200);
    expect(row(t, "b@example.com")!.unsubscribed_at).not.toBeNull();

    t.sqlite.run("UPDATE site_state SET makers_invited_at = 1 WHERE id = 1");
    const before = t.emails.length;
    const result = await processWaitlistEmails(t.env, services(t.env).db);
    expect(result.makerInvites).toBe(0);
    expect(t.emails.length).toBe(before);
    expect((await new Client(t).post("/waitlist/unsubscribe", { token: "nope.0.abc" })).status).toBe(404);
  });
});

describe("campaign tags and share links", () => {
  test("stores utm params and the referrer; the share code comes back on joining", async () => {
    const t = setup({ WAITLIST: "true" });
    const first = await joinAs(t, "first@example.com", { utm: { source: "tiktok", medium: "social", campaign: "b01", content: "v3" } });
    expect(row(t, "first@example.com")).toMatchObject({ utm_source: "tiktok", utm_medium: "social", utm_campaign: "b01", utm_content: "v3" });
    const code = first.data.refCode as string;

    await join(t, { email: "friend@example.com", ref: code.toUpperCase() });
    await joinAs(t, "friend2@example.com", { ref: code });
    await join(t, { email: "stranger@example.com", ref: "unknown1" });
    expect(row(t, "friend@example.com")!.referred_by).toBe(row(t, "first@example.com")!.id);
    expect(row(t, "stranger@example.com")!.referred_by).toBeNull();

    // A sign-up still pending from double opt-in doesn't count as a referrer.
    addPending(t, "pending@example.com");
    await join(t, { email: "via-pending@example.com", ref: row(t, "pending@example.com")!.ref_code });
    expect(row(t, "via-pending@example.com")!.referred_by).toBeNull();

    // A later submission doesn't replace the first-touch tags or the referrer.
    await join(t, { email: "friend@example.com", utm: { source: "instagram" }, ref: "unknown1" });
    expect(row(t, "friend@example.com")).toMatchObject({ utm_source: null, referred_by: row(t, "first@example.com")!.id });
    expect(t.sqlite.query("SELECT COUNT(*) AS n FROM waitlist WHERE referred_by = ?").get(row(t, "first@example.com")!.id)).toEqual({ n: 2 });
  });
});

describe("the waiting counter", () => {
  test("shows from 300 confirmed, subscribed sign-ups, read from the database", async () => {
    const t = setup({ WAITLIST: "true" });
    const add = (from: number, to: number, extra = "1, NULL") =>
      t.sqlite.run(
        `WITH RECURSIVE n(i) AS (SELECT ${from} UNION ALL SELECT i + 1 FROM n WHERE i < ${to})
         INSERT INTO waitlist (id, email, role, ref_code, confirmed_at, unsubscribed_at, created_at)
         SELECT 'w' || i, 'w' || i || '@example.com', 'explorer', 'r' || i, ${extra}, 1 FROM n`,
      );
    add(1, 299);
    add(300, 300, "NULL, NULL");
    add(301, 301, "1, 5");
    expect((await new Client(t).get("/home")).data.waitingCount).toBeNull();
    add(302, 302);
    expect((await new Client(t).get("/home")).data.waitingCount).toBe(300);

    const lower = setup({ WAITLIST: "true", WAITLIST_COUNT_MIN: "1" });
    expect((await new Client(lower).get("/home")).data.waitingCount).toBeNull();
    await joinAs(lower, "a@example.com");
    expect((await new Client(lower).get("/home")).data.waitingCount).toBe(1);

    const launched = setup({ WAITLIST: "false", WAITLIST_COUNT_MIN: "0" });
    expect((await new Client(launched).get("/home")).data.waitingCount).toBeNull();
  });
});

describe("email quota", () => {
  test("a quota error queues the welcome email, the visitor sees the same answer, and the cron sends it later", async () => {
    const t = setup({ WAITLIST: "true", RESEND_API_KEY: "re_test" });
    let quota = true;
    const sent: string[] = [];
    const restore = mockFetch(async (url, init) => {
      if (!url.href.startsWith("https://api.resend.com/")) return;
      if (quota) return new Response(JSON.stringify({ name: "daily_quota_exceeded", message: "quota" }), { status: 429 });
      const payload = JSON.parse(String(init?.body));
      for (const m of Array.isArray(payload) ? payload : [payload]) sent.push(m.to[0]);
      return Response.json({ data: [] });
    });
    try {
      const res = await join(t, { email: "a@example.com" });
      expect(res.data).toEqual({ ok: true, refCode: row(t, "a@example.com")!.ref_code });
      expect(row(t, "a@example.com")).toMatchObject({ confirmation_queued: 1, confirmation_sent_at: null });
      const db = services(t.env).db;
      expect(await processWaitlistEmails(t.env, db)).toMatchObject({ confirmations: 0, deferred: true });

      quota = false;
      expect(await processWaitlistEmails(t.env, db)).toMatchObject({ confirmations: 1, deferred: false });
      expect(sent).toEqual(["a@example.com"]);
      expect(row(t, "a@example.com")).toMatchObject({ confirmation_queued: 0 });
      expect(row(t, "a@example.com")!.confirmation_sent_at).not.toBeNull();
    } finally {
      restore();
    }
  });

  test("a quota error holds the maker invites for the cron, which sends them later", async () => {
    const t = setup({ WAITLIST: "true", RESEND_API_KEY: "re_test" });
    let quota = false;
    const sent: string[] = [];
    const restore = mockFetch(async (url, init) => {
      if (!url.href.startsWith("https://api.resend.com/")) return;
      if (quota) return new Response(JSON.stringify({ name: "daily_quota_exceeded", message: "quota" }), { status: 429 });
      const payload = JSON.parse(String(init?.body));
      for (const m of Array.isArray(payload) ? payload : [payload]) sent.push(m.to[0]);
      return Response.json({ data: [] });
    });
    try {
      await joinAs(t, "a@example.com", { role: "maker" });
      await joinAs(t, "b@example.com", { role: "maker" });
      sent.length = 0;
      quota = true;
      t.sqlite.run("UPDATE site_state SET makers_invited_at = 1 WHERE id = 1");
      const db = services(t.env).db;
      expect(await processWaitlistEmails(t.env, db)).toMatchObject({ makerInvites: 0, deferred: true });
      expect(row(t, "a@example.com")!.invited_at).toBeNull();

      quota = false;
      expect(await processWaitlistEmails(t.env, db)).toMatchObject({ makerInvites: 2, deferred: false });
      expect(sent.sort()).toEqual(["a@example.com", "b@example.com"]);
      expect(row(t, "a@example.com")!.invited_at).not.toBeNull();

      const admin = await signUp(t, { email: "admin@example.com" });
      const stats = (await admin.client.get("/admin/waitlist/stats")).data;
      // Sent: the 2 welcome emails, the 2 invites and the admin's own verification email.
      expect(stats.emailUsage[0]).toMatchObject({ sent: 5, failed: 0 });
      expect(stats.emailUsage[0].deferred).toBeGreaterThan(0);
    } finally {
      restore();
    }
  });

  test("a refused address is recorded as failed and shown to the admin", async () => {
    const t = setup({ WAITLIST: "true", RESEND_API_KEY: "re_test" });
    const restore = mockFetch(async (url) => {
      if (url.href.startsWith("https://api.resend.com/")) return new Response(JSON.stringify({ name: "validation_error", message: "Invalid `to` field." }), { status: 422 });
    });
    try {
      expect((await joinAs(t, "bad@example.com")).status).toBe(200);
    } finally {
      restore();
    }
    expect(row(t, "bad@example.com")!.confirmation_queued).toBe(0);
    const admin = await signUp(t, { email: "admin@example.com" });
    const stats = (await admin.client.get("/admin/waitlist/stats")).data;
    expect(stats.failedEmails).toEqual([expect.objectContaining({ email: "bad@example.com", error: "validation_error: Invalid `to` field." })]);
  });
});

describe("retention", () => {
  test("unconfirmed rows go 7 days after their email was sent; queued ones stay; everything goes 6 months after launch", async () => {
    const t = setup({ WAITLIST: "true" });
    const now = Math.floor(Date.now() / 1000);
    const add = (id: string, confirmedAt: number | null, sentAt: number | null, createdAt: number, failedAt: number | null = null) =>
      t.sqlite.run(
        "INSERT INTO waitlist (id, email, role, ref_code, confirmed_at, confirmation_sent_at, confirmation_queued, email_failed_at, created_at) VALUES (?, ?, 'explorer', ?, ?, ?, ?, ?, ?)",
        [id, `${id}@example.com`, id, confirmedAt, sentAt, sentAt === null && failedAt === null ? 1 : 0, failedAt, createdAt],
      );
    add("old_sent", null, now - 8 * 86400, now - 8 * 86400);
    add("late_sent", null, now - 2 * 86400, now - 30 * 86400); // signed up long ago, email sent only 2 days ago
    add("queued", null, null, now - 30 * 86400);
    add("failed", null, null, now - 30 * 86400, now - 8 * 86400);
    add("confirmed", now - 20 * 86400, now - 20 * 86400, now - 20 * 86400);
    const db = services(t.env).db;
    await cleanup(t.env, db);
    expect(rows(t).map((r) => r.id).sort()).toEqual(["confirmed", "late_sent", "queued"]);

    t.sqlite.run("UPDATE site_state SET launched_at = ? WHERE id = 1", [now - 170 * 86400]);
    await cleanup(t.env, db);
    expect(rows(t)).toHaveLength(3);
    t.sqlite.run("UPDATE site_state SET launched_at = ? WHERE id = 1", [now - 190 * 86400]);
    await cleanup(t.env, db);
    expect(rows(t)).toHaveLength(0);
  });
});

describe("invites and launch", () => {
  test("Invite makers: the invite link creates the maker's account with their waitlist data", async () => {
    const t = setup({ WAITLIST: "true", LAUNCH_DATE: "2026-12-08" });
    await joinAs(t, "maker@example.com", { role: "maker", interests: ["c_design"], utm: { source: "tiktok", campaign: "b01" } });
    await joinAs(t, "explorer@example.com");
    const admin = await signUp(t, { email: "admin@example.com" });
    expect((await admin.client.post("/admin/waitlist/invite-makers", { confirm: "nope" })).status).toBe(400);
    expect((await new Client(t).post("/admin/waitlist/invite-makers", { confirm: "INVITE" })).status).toBe(401);
    expect((await admin.client.post("/admin/waitlist/invite-makers", { confirm: "INVITE" })).status).toBe(200);
    await settle(t);

    const invite = emailsTo(t, "maker@example.com").at(-1)!;
    expect(invite).toContain("Your early access to Tryworthy");
    expect(invite).toContain("before launch day (December 8, 2026).");
    // Explorers have only their welcome email.
    expect(emailsTo(t, "explorer@example.com")).toHaveLength(1);
    expect(row(t, "maker@example.com")!.invited_at).not.toBeNull();

    // Asking again through the form resends the invite, at most every 10 minutes after the last email.
    t.sqlite.run("UPDATE waitlist SET confirmation_sent_at = 0");
    await join(t, { email: "maker@example.com", role: "maker" });
    expect(emailsTo(t, "maker@example.com")).toHaveLength(3);
    expect(emailsTo(t, "maker@example.com").at(-1)).toContain("Your early access to Tryworthy");
    await join(t, { email: "maker@example.com", role: "maker" });
    expect(emailsTo(t, "maker@example.com")).toHaveLength(3);

    const token = linkIn(invite, "/join")!;
    const res = await new Client(t).post("/waitlist/join", { token });
    expect(res.status).toBe(200);
    const verify = new URL(res.data.url);
    expect(verify.pathname).toBe("/auth/magic-link/verify");
    const browser = new Client(t);
    const done = await browser.get(verify.pathname + verify.search);
    expect(done.status).toBe(302);
    expect(done.headers.get("location")).toBe("http://localhost:4321/onboarding");
    const me = await browser.get("/me");
    expect(me.data).toMatchObject({ email: "maker@example.com", emailVerified: true, interests: ["design"] });
    expect(t.sqlite.query("SELECT utm_source, utm_campaign FROM user WHERE email = 'maker@example.com'").get()).toEqual({ utm_source: "tiktok", utm_campaign: "b01" });

    // An explorer's sign-up can't be used as an invite.
    const explorerToken = await signToken(t.env, "invite", row(t, "explorer@example.com")!.id, Math.floor(Date.now() / 1000) + 600);
    expect((await new Client(t).post("/waitlist/join", { token: explorerToken })).status).toBe(404);
  });

  test("Launch ends the waitlist and emails explorers the top picks in their categories", async () => {
    const t = setup({ WAITLIST: "true" });
    await joinAs(t, "picky@example.com", { interests: ["c_design"] });
    await joinAs(t, "open@example.com");
    addPending(t, "pending@example.com");
    const maker = await signUp(t, { email: "admin@example.com" });
    const domainId = verifyDomain(t, maker.id, "x.test");
    const add = (id: string, title: string, score: number, cat: string) => {
      t.sqlite.run(
        "INSERT INTO products (id, maker_id, domain_id, slug, url, url_normalized, title, tagline, description, stage, pricing, quality_ok, score_week, published_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'A tagline', 'A description', 'launched', 'free', 1, ?, 1, 1)",
        [id, maker.id, domainId, id, `https://x.test/${id}`, `https://x.test/${id}`, title, score],
      );
      t.sqlite.run("INSERT INTO product_categories (product_id, category_id, published_at) VALUES (?, ?, 1)", [id, cat]);
    };
    add("p1", "Design One", 5, "c_design");
    add("p2", "Dev Two", 9, "c_developer-tools");

    expect((await maker.client.post("/admin/waitlist/launch", { confirm: "LAUNCH" })).status).toBe(200);
    await settle(t);
    expect((await new Client(t).get("/site")).data.prelaunch).toBe(false);

    const picky = emailsTo(t, "picky@example.com").at(-1)!;
    expect(picky).toContain(`subject="We're live. Here's what's worth trying in your categories."`);
    expect(picky).toContain("Design One — A tagline");
    expect(picky).not.toContain("Dev Two");
    const open = emailsTo(t, "open@example.com").at(-1)!;
    expect(open).toContain(`subject="We're live. Here's what's worth trying this week."`);
    expect(open.indexOf("Dev Two")).toBeLessThan(open.indexOf("Design One"));
    expect(emailsTo(t, "pending@example.com")).toHaveLength(0);

    // Nothing is sent twice.
    const count = t.emails.length;
    await processWaitlistEmails(t.env, services(t.env).db);
    expect(t.emails.length).toBe(count);
  });
});

describe("admin export", () => {
  test("CSV with every row, for admins only", async () => {
    const t = setup({ WAITLIST: "true" });
    await joinAs(t, "a@example.com", { utm: { campaign: 'b01, "quoted"' }, foundVia: "friend" });
    expect((await new Client(t).get("/admin/waitlist.csv")).status).toBe(401);
    const admin = await signUp(t, { email: "admin@example.com" });
    const res = await admin.client.get("/admin/waitlist.csv");
    expect(res.headers.get("content-type")).toContain("text/csv");
    const lines = String(res.data).trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('a@example.com,explorer,[],,,,"b01, ""quoted""",,friend,');
    const stats = (await admin.client.get("/admin/waitlist/stats")).data;
    expect(stats.daily).toEqual([expect.objectContaining({ role: "explorer", campaign: 'b01, "quoted"', n: 1 })]);
    expect(stats.foundVia).toEqual([{ foundVia: "friend", n: 1 }]);
  });
});
