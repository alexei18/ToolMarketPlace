import { describe, expect, test } from "bun:test";
import { TERMS_VERSION } from "@tm/shared";
import { hashPassword, verifyPassword } from "../src/lib/password";
import { Client, WEB, mockFetch, setup, signUp, type TestContext } from "./helpers";

const GOOGLE = { GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "secret" };

/**
 * Goes through "Continue with Google" with a stand-in for Google's token and key endpoints, which
 * signs the ID token with its own key. Returns the browser-like client and where the callback sent it.
 */
async function googleSignIn(t: TestContext, profile: { sub: string; email: string; email_verified: boolean; name: string }) {
  const client = new Client(t);
  const start = await client.post("/auth/sign-in/social", {
    provider: "google",
    callbackURL: `${WEB}/feed`,
    newUserCallbackURL: `${WEB}/onboarding`,
    errorCallbackURL: `${WEB}/login?oauth=failed`,
  });
  const authorize = new URL(start.data.url);

  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = { ...(await crypto.subtle.exportKey("jwk", keys.publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const nonce = authorize.searchParams.get("nonce");
  const unsigned = `${b64({ alg: "RS256", kid: "test-key", typ: "JWT" })}.${b64({ iss: "https://accounts.google.com", aud: GOOGLE.GOOGLE_CLIENT_ID, iat: now, exp: now + 600, ...(nonce ? { nonce } : {}), ...profile })}`;
  const idToken = `${unsigned}.${Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(unsigned))).toString("base64url")}`;

  const restore = mockFetch((url) => {
    if (url.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "at", token_type: "Bearer", expires_in: 3600, scope: "openid email profile", id_token: idToken });
    if (url.hostname === "www.googleapis.com") return Response.json({ keys: [jwk] });
    return undefined;
  });
  try {
    const res = await client.get(`/auth/callback/google?code=good-code&state=${encodeURIComponent(authorize.searchParams.get("state")!)}`);
    return { client, authorize, status: res.status, location: res.headers.get("location") ?? "" };
  } finally {
    restore();
  }
}

describe("auth", () => {
  test("sign up, session cookie, hint cookie and /me", async () => {
    const t = setup();
    const { client, id } = await signUp(t, { name: "Ana Pop", email: "ana@example.com" });
    expect([...client.cookies.keys()]).toContain("better-auth.session_token");
    expect(client.cookies.get("tm_auth")).toBe("1");

    const me = await client.get("/me");
    expect(me.status).toBe(200);
    expect(me.data.id).toBe(id);
    expect(me.data.username).toBe("ana_pop");
    expect(me.data.role).toBe("user");
    expect(me.data.onboarded).toBe(false);
    expect(me.data.prelaunch).toBe(false);
    expect(me.data.isMaker).toBe(false);
    expect(me.data.digestFrequency).toBe("weekly");
  });

  test("usernames stay unique", async () => {
    const t = setup();
    await signUp(t, { name: "Same Name" });
    const second = await signUp(t, { name: "Same Name" });
    const me = await second.client.get("/me");
    expect(me.data.username).toBe("same_name2");
  });

  test("sign out clears the hint cookie", async () => {
    const t = setup();
    const { client } = await signUp(t);
    const res = await client.post("/auth/sign-out", {});
    expect(res.status).toBe(200);
    expect(client.cookies.has("tm_auth")).toBe(false);
    expect((await client.get("/me")).status).toBe(401);
  });

  test("sign in with password", async () => {
    const t = setup();
    await signUp(t, { email: "bob@example.com" });
    const c = new Client(t);
    const bad = await c.post("/auth/sign-in/email", { email: "bob@example.com", password: "wrong password!" });
    expect(bad.status).toBe(401);
    const ok = await c.post("/auth/sign-in/email", { email: "bob@example.com", password: "correct horse battery" });
    expect(ok.status).toBe(200);
    expect((await c.get("/me")).status).toBe(200);
  });

  test("admin by ADMIN_EMAILS once the email is verified", async () => {
    const t = setup();
    const { client } = await signUp(t, { email: "admin@example.com" });
    expect((await client.get("/me")).data.role).toBe("admin");
  });

  test("suspended users can sign in, but only to read and contest the suspension", async () => {
    const t = setup();
    const { id } = await signUp(t, { email: "bad@example.com" });
    t.sqlite.run("UPDATE user SET banned_at = 1 WHERE id = ?", [id]);
    const c = new Client(t);
    const res = await c.post("/auth/sign-in/email", { email: "bad@example.com", password: "correct horse battery" });
    expect(res.status).toBe(200);
    expect((await c.get("/me")).data.banned).toBe(true);
    expect((await c.get("/me/decisions")).status).toBe(200);
    expect((await c.get("/me/saves")).data.error.code).toBe("BANNED");
    expect((await c.put("/me/interests", { categories: ["ai", "design", "finance"] })).data.error.code).toBe("BANNED");
  });

  test("cross-site writes are rejected", async () => {
    const t = setup();
    const { client } = await signUp(t);
    const res = await client.req("PUT", "/me/interests", { json: { categories: ["ai", "design", "finance"] }, headers: { origin: "https://evil.example" } });
    // The client forces the web origin; send a raw request instead.
    expect(res.status).toBe(200);
    const raw = await t.app.fetch(
      new Request("http://localhost:8787/me/interests", {
        method: "PUT",
        headers: { origin: "https://evil.example", cookie: [...client.cookies].map(([k, v]) => `${k}=${v}`).join("; "), "content-type": "application/json" },
        body: JSON.stringify({ categories: ["ai", "design", "finance"] }),
      }),
      t.env,
      { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext,
    );
    expect(raw.status).toBe(403);
  });

  test("Google sign-in creates a confirmed account, a session and the hint cookie", async () => {
    const t = setup(GOOGLE);
    const g = await googleSignIn(t, { sub: "google-1", email: "new.person@gmail.com", email_verified: true, name: "New Person" });
    expect(g.authorize.origin + g.authorize.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(g.authorize.searchParams.get("redirect_uri")).toBe("http://localhost:8787/auth/callback/google");
    expect(g.status).toBe(302);
    expect(g.location).toBe(`${WEB}/onboarding`);
    expect([...g.client.cookies.keys()]).toContain("better-auth.session_token");
    expect(g.client.cookies.get("tm_auth")).toBe("1");

    const me = await g.client.get("/me");
    expect(me.status).toBe(200);
    expect(me.data).toMatchObject({ email: "new.person@gmail.com", emailVerified: true, name: "New Person", username: "new_person", onboarded: false });

    // signing in again is the same account, and returning users go to their feed
    const again = await googleSignIn(t, { sub: "google-1", email: "new.person@gmail.com", email_verified: true, name: "New Person" });
    expect(again.location).toBe(`${WEB}/feed`);
    expect((await again.client.get("/me")).data.id).toBe(me.data.id);
  });

  test("Google links to a confirmed email account and refuses an unconfirmed one", async () => {
    const t = setup(GOOGLE);
    const confirmed = await signUp(t, { email: "confirmed@example.com", verified: true });
    const linked = await googleSignIn(t, { sub: "google-2", email: "confirmed@example.com", email_verified: true, name: "Confirmed User" });
    expect(linked.location).toBe(`${WEB}/feed`);
    expect((await linked.client.get("/me")).data.id).toBe(confirmed.id);

    // Someone could have registered this address first without owning it: Google must not land in that account.
    await signUp(t, { email: "pending@example.com", verified: false });
    const refused = await googleSignIn(t, { sub: "google-3", email: "pending@example.com", email_verified: true, name: "Pending User" });
    const to = new URL(refused.location);
    expect(to.origin + to.pathname).toBe(`${WEB}/login`);
    expect(to.searchParams.get("oauth")).toBe("failed");
    expect(to.searchParams.get("error")).toBe("account_not_linked");
    expect((await refused.client.get("/me")).status).toBe(401);
  });

  test("an OAuth callback without a usable state ends on the site's login page", async () => {
    const t = setup({ GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "secret" });
    const res = await t.app.fetch(new Request("http://localhost:8787/auth/callback/google?code=x&state=unknown"), t.env, {
      waitUntil() {},
      passThroughOnException() {},
    } as unknown as ExecutionContext);
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get("location")!);
    expect(to.origin).toBe(t.env.WEB_ORIGIN);
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("oauth")).toBe("failed");
    expect(to.searchParams.get("error")).toBe("state_mismatch");
  });
});

describe("password hashing", () => {
  test("round trip", async () => {
    const h = await hashPassword("s3cret pass");
    expect(h.startsWith("pbkdf2_sha256$100000$")).toBe(true);
    expect(await verifyPassword({ hash: h, password: "s3cret pass" })).toBe(true);
    expect(await verifyPassword({ hash: h, password: "s3cret pasS" })).toBe(false);
    expect(await verifyPassword({ hash: "garbage", password: "x" })).toBe(false);
  });
});

describe("rate limits", () => {
  test("visitors are limited per IP; the site's server-side calls are exempt", async () => {
    const seen: string[] = [];
    const limiter = { limit: async ({ key }: { key: string }) => (seen.push(key), { success: false }) } as unknown as RateLimit;
    const t = setup({ ANON_LIMITER: limiter, INTERNAL_SECRET: "s3cret" } as never);
    const visitor = await new Client(t).get("/categories");
    expect(visitor.status).toBe(429);
    expect(seen).toEqual(["ip:203.0.113.7"]);
    const site = await new Client(t).get("/categories", { "x-internal-key": "s3cret" });
    expect(site.status).toBe(200);
    const forged = await new Client(t).get("/categories", { "x-internal-key": "guess" });
    expect(forged.status).toBe(429);
  });
});

describe("terms acceptance (docs/LEGAL.md)", () => {
  test("email sign-up needs the current Terms version and stores when it was accepted", async () => {
    const t = setup();
    for (const acceptedTerms of [undefined, "2000-01-01"]) {
      const res = await new Client(t).post("/auth/sign-up/email", { email: `t${acceptedTerms}@example.com`, password: "correct horse battery", name: "T", acceptedTerms });
      expect(res.status).toBe(400);
      expect(res.data.code).toBe("TERMS_NOT_ACCEPTED");
    }
    expect(t.sqlite.query("SELECT count(*) AS n FROM user").get()).toEqual({ n: 0 });

    const { client, id } = await signUp(t);
    const row = t.sqlite.query("SELECT terms_version, terms_accepted_at FROM user WHERE id = ?").get(id) as { terms_version: string; terms_accepted_at: number };
    expect(row.terms_version).toBe(TERMS_VERSION);
    expect(Math.abs(row.terms_accepted_at - Date.now() / 1000)).toBeLessThan(60);
    expect((await client.get("/me")).data.termsVersion).toBe(TERMS_VERSION);
  });

  test("Google sign-ups accept in onboarding; only the current version is accepted", async () => {
    const t = setup(GOOGLE);
    const { client, location } = await googleSignIn(t, { sub: "g-terms", email: "terms@gmail.com", email_verified: true, name: "Terms" });
    expect(location).toStartWith(`${WEB}/onboarding`);
    expect((await client.get("/me")).data.termsVersion).toBeNull();

    expect((await client.post("/me/terms", { version: "2000-01-01" })).status).toBe(400);
    expect((await client.post("/me/terms", { version: TERMS_VERSION })).status).toBe(200);
    expect((await client.get("/me")).data.termsVersion).toBe(TERMS_VERSION);
    expect((await new Client(t).post("/me/terms", { version: TERMS_VERSION })).status).toBe(401);
  });
});
