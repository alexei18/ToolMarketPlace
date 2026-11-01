import type { Database as SQLite } from "bun:sqlite";
import { TERMS_VERSION } from "@tm/shared";
import { createApp } from "../src/app";
import type { Env } from "../src/env";
import { createD1, createR2 } from "./d1-shim";

export const WEB = "http://localhost:4321";
export const API = "http://localhost:8787";

export interface TestContext {
  env: Env;
  sqlite: SQLite;
  r2: ReturnType<typeof createR2>;
  app: ReturnType<typeof createApp>;
  pending: Promise<unknown>[];
  /** Emails "sent" through the console fallback. */
  emails: string[];
}

const emailSink: string[] = [];
const originalLog = console.log;
console.log = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].startsWith("[email]")) emailSink.push(args.join(" "));
  else if (typeof args[0] === "string" && args[0].startsWith("[admin]")) return;
  else originalLog(...args);
};

export function setup(overrides: Partial<Env> = {}): TestContext {
  emailSink.length = 0;
  const { d1, sqlite } = createD1();
  const r2 = createR2();
  const env = {
    DB: d1,
    IMAGES_BUCKET: r2,
    SITE_NAME: "ToolMarket",
    WEB_ORIGIN: WEB,
    API_ORIGIN: API,
    IMAGES_BASE_URL: "",
    COOKIE_DOMAIN: "",
    ADMIN_EMAILS: "admin@example.com",
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
    ...overrides,
  } as Env;
  return { env, sqlite, r2, app: createApp(), pending: [], emails: emailSink };
}

/** A tiny browser: keeps cookies and sends the web app's Origin like fetch() from the site would. */
export class Client {
  cookies = new Map<string, string>();
  constructor(private t: TestContext) {}

  async req(method: string, path: string, opts: { json?: unknown; body?: BodyInit; headers?: Record<string, string> } = {}) {
    const headers = new Headers(opts.headers);
    headers.set("origin", WEB);
    headers.set("cf-connecting-ip", "203.0.113.7");
    if (this.cookies.size) headers.set("cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    let body = opts.body;
    if (opts.json !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(opts.json);
    }
    const ctx = { waitUntil: (p: Promise<unknown>) => this.t.pending.push(p), passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
    const res = await this.t.app.fetch(new Request(`${API}${path}`, { method, headers, body }), this.t.env, ctx);
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const idx = pair!.indexOf("=");
      const name = pair!.slice(0, idx).trim();
      const value = pair!.slice(idx + 1).trim();
      if (!value || /max-age=0/i.test(c)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data, headers: res.headers };
  }

  get = (path: string, headers?: Record<string, string>) => this.req("GET", path, { headers });
  post = (path: string, json?: unknown) => this.req("POST", path, { json: json ?? {} });
  put = (path: string, json?: unknown) => this.req("PUT", path, { json: json ?? {} });
  patch = (path: string, json?: unknown) => this.req("PATCH", path, { json: json ?? {} });
  del = (path: string, json?: unknown) => this.req("DELETE", path, { json: json ?? {} });
}

let counter = 0;

/** Signs up a fresh user; returns the client and the user's id. */
export async function signUp(t: TestContext, opts: { email?: string; name?: string; verified?: boolean; ageDays?: number } = {}) {
  const client = new Client(t);
  const email = opts.email ?? `user${++counter}_${Date.now()}@example.com`;
  const res = await client.post("/auth/sign-up/email", { email, password: "correct horse battery", name: opts.name ?? `User ${counter}`, acceptedTerms: TERMS_VERSION });
  if (res.status !== 200) throw new Error(`sign-up failed ${res.status} ${JSON.stringify(res.data)}`);
  const id = res.data.user.id as string;
  if (opts.verified !== false) t.sqlite.run("UPDATE user SET email_verified = 1 WHERE id = ?", [id]);
  if (opts.ageDays) t.sqlite.run("UPDATE user SET created_at = created_at - ? WHERE id = ?", [opts.ageDays * 86400, id]);
  return { client, id, email };
}

/** Marks a domain as verified for a user without going through DNS. */
export function verifyDomain(t: TestContext, userId: string, hostname: string): string {
  const id = `dom_${hostname.replace(/\W/g, "")}_${userId.slice(-4)}`;
  t.sqlite.run("INSERT INTO domains (id, user_id, hostname, token, method, verified_at, created_at) VALUES (?, ?, ?, 'tok', 'dns', 1, 1)", [id, userId, hostname]);
  return id;
}

type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response> | undefined;

/** Replaces global fetch: DoH lookups resolve to a public IP unless overridden, other URLs go to `handler`. */
export function mockFetch(handler: Handler, dns: Record<string, string[]> = {}) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    if (url.hostname === "cloudflare-dns.com") {
      const name = url.searchParams.get("name")!;
      const type = url.searchParams.get("type")!;
      if (type === "TXT") {
        const values = dns[`TXT:${name}`] ?? [];
        return Response.json({ Status: 0, Answer: values.map((v) => ({ name, type: 16, data: `"${v}"` })) });
      }
      if (type === "AAAA") return Response.json({ Status: 0, Answer: [] });
      const ips = dns[name] ?? ["93.184.216.34"];
      return Response.json({ Status: 0, Answer: ips.map((ip) => ({ name, type: 1, data: ip })) });
    }
    const res = await handler(url, init);
    if (res) return res;
    return new Response("not mocked", { status: 599 });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

/** 1x1-ish PNG of a given size (header only matters for size sniffing). */
export function pngBytes(width = 1200, height = 630): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, width);
  dv.setUint32(20, height);
  b[60] = Math.floor(Math.random() * 255);
  return b;
}

export const PAGE_HTML = (title: string, opts: { image?: string; description?: string; meta?: string } = {}) => `<!doctype html><html><head>
<title>${title}</title>
<meta property="og:title" content="${title}">
<meta name="description" content="${opts.description ?? "A useful tool for people who like useful tools."}">
${opts.image ? `<meta property="og:image" content="${opts.image}">` : ""}
${opts.meta ?? ""}
<link rel="icon" href="/favicon.png">
</head><body>hello</body></html>`;

export async function settle(t: TestContext) {
  await Promise.allSettled(t.pending.splice(0));
}
