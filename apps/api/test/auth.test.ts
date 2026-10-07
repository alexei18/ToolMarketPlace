import { describe, expect, test } from "bun:test";
import { hashPassword, verifyPassword } from "../src/lib/password";
import { Client, setup, signUp } from "./helpers";

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

  test("banned users cannot sign in", async () => {
    const t = setup();
    const { id } = await signUp(t, { email: "bad@example.com" });
    t.sqlite.run("UPDATE user SET banned_at = 1 WHERE id = ?", [id]);
    const c = new Client(t);
    const res = await c.post("/auth/sign-in/email", { email: "bad@example.com", password: "correct horse battery" });
    expect(res.status).toBe(403);
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
