import { describe, expect, test } from "bun:test";
import { imageSize, sniffImageType } from "../src/lib/images";
import { extractMetadata, splitTitle } from "../src/lib/metadata";
import { b64uDecode, b64uEncode, encryptPayload, generateVapidKeys, vapidHeader } from "../src/lib/webpush";
import { ftsQuery } from "../src/routes/public";
import { usageAlerts } from "../src/jobs/maintenance";
import { pngBytes } from "./helpers";

const enc = new TextEncoder();

async function hkdf(salt: BufferSource, ikm: BufferSource, info: BufferSource, len: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8));
}

/** RFC 8291 decryption as a browser would do it, to prove encryptPayload is correct. */
async function decrypt(body: Uint8Array, uaKeys: CryptoKeyPair, uaPublic: Uint8Array, authSecret: Uint8Array) {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16);
  const idlen = body[20]!;
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  expect(rs).toBe(4096);
  const asKey = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey } as EcdhKeyDeriveParams, uaKeys.privateKey, 256));
  const info = new Uint8Array([...enc.encode("WebPush: info\0"), ...uaPublic, ...asPublic]);
  const ikm = await hkdf(authSecret, secret, info, 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, cipher));
  expect(plain[plain.length - 1]).toBe(2);
  return new TextDecoder().decode(plain.slice(0, -1));
}

describe("web push", () => {
  test("aes128gcm payload decrypts with the subscriber's keys", async () => {
    const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    const uaPublic = new Uint8Array((await crypto.subtle.exportKey("raw", ua.publicKey)) as ArrayBuffer);
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const body = await encryptPayload({ p256dh: b64uEncode(uaPublic), auth: b64uEncode(auth) }, enc.encode('{"title":"Hi"}'));
    expect(await decrypt(body, ua, uaPublic, auth)).toBe('{"title":"Hi"}');
  });

  test("VAPID header is a valid ES256 JWT", async () => {
    const keys = await generateVapidKeys();
    const header = await vapidHeader({ subject: "mailto:a@b.c", ...keys }, "https://fcm.googleapis.com/fcm/send/abc");
    const m = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
    const [h, p, s] = m[1]!.split(".");
    expect(JSON.parse(new TextDecoder().decode(b64uDecode(p!)))).toMatchObject({ aud: "https://fcm.googleapis.com", sub: "mailto:a@b.c" });
    const pub = await crypto.subtle.importKey("raw", b64uDecode(m[2]!), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, b64uDecode(s!), enc.encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });
});

describe("metadata", () => {
  test("og tags, entities, relative image, favicon", () => {
    const html = `<html><head>
      <title>Fallback</title>
      <meta property='og:title' content="Acme &amp; Co — Ship faster">
      <meta content="Build &quot;things&quot; quickly" name="description">
      <meta property="og:image" content="/img/og.png?v=1">
      <link rel="shortcut icon" href="/fav.ico">
      </head><body><meta property="og:image" content="/ignored.png"></body></html>`;
    const m = extractMetadata(html, "https://acme.com/start");
    expect(m.title).toBe("Acme & Co — Ship faster");
    expect(m.description).toBe('Build "things" quickly');
    expect(m.image).toBe("https://acme.com/img/og.png?v=1");
    expect(m.favicon).toBe("https://acme.com/fav.ico");
  });

  test("twitter:image fallback and no image", () => {
    expect(extractMetadata(`<head><meta name="twitter:image" content="https://cdn.x.com/a.jpg"></head>`, "https://x.com").image).toBe("https://cdn.x.com/a.jpg");
    expect(extractMetadata(`<head><meta property="og:image" content="javascript:alert(1)"></head>`, "https://x.com").image).toBeNull();
  });

  test("splitTitle", () => {
    expect(splitTitle("Acme — Invoices that pay themselves", null)).toEqual({ name: "Acme", tagline: "Invoices that pay themselves" });
    expect(splitTitle("Invoices that pay themselves | Acme", "Acme")).toEqual({ name: "Acme", tagline: "Invoices that pay themselves" });
    expect(splitTitle("Acme", null)).toEqual({ name: "Acme", tagline: null });
  });
});

describe("images", () => {
  test("sniffs types and sizes", () => {
    const png = pngBytes(640, 400);
    expect(sniffImageType(png)).toBe("image/png");
    expect(imageSize(png, "image/png")).toEqual({ width: 640, height: 400 });
    expect(sniffImageType(enc.encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x03, 0x58, 0x02, 0, 0, 0]);
    expect(imageSize(gif, "image/gif")).toEqual({ width: 800, height: 600 });
    // Minimal JPEG: SOI, APP0 (len 16), SOF0 with 300x200
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xc8, 0x01, 0x2c, 0x03]);
    expect(sniffImageType(jpg)).toBe("image/jpeg");
    expect(imageSize(jpg, "image/jpeg")).toEqual({ width: 300, height: 200 });
  });
});

describe("search", () => {
  test("ftsQuery quotes every term", () => {
    expect(ftsQuery('notion "clone" AND OR*')).toBe('"notion"* "clone"* "and"* "or"*');
    expect(ftsQuery("  ")).toBeNull();
    expect(ftsQuery("ăîș café")).toBe('"ăîș"* "café"*');
  });
});

describe("usage alerts", () => {
  test("alerts above 70% of the free limits", () => {
    const alerts = usageAlerts({ workersRequests: 75_000, d1RowsRead: 1000, d1RowsWritten: 90_000, r2ClassA: 0, r2ClassB: 0 });
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toContain("workersRequests");
  });
});
