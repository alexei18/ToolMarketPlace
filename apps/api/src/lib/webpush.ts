/*
 * Web Push with Web Crypto only (runs in Workers without Node APIs):
 * VAPID authentication (RFC 8292) and aes128gcm payload encryption (RFC 8291 / RFC 8188).
 */

const enc = new TextEncoder();

export function b64uEncode(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64uDecode(str: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  const bin = atob((str + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

async function hkdf(salt: BufferSource, ikm: BufferSource, info: BufferSource, length: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface VapidKeys {
  subject: string;
  publicKey: string;
  privateKey: string;
}

/** Encrypts a payload for one subscription (single aes128gcm record). */
export async function encryptPayload(target: Pick<PushTarget, "p256dh" | "auth">, plaintext: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = b64uDecode(target.p256dh);
  const authSecret = b64uDecode(target.auth);
  const asKeys = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", asKeys.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  // workers-types names this member `$public`; the runtime (like every Web Crypto) expects `public`.
  const ecdhParams = { name: "ECDH", public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdhParams, asKeys.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(plaintext, new Uint8Array([2]))));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.byteLength);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.byteLength;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

const keyCache = new Map<string, CryptoKey>();

async function vapidSigningKey(publicKey: string, privateKey: string): Promise<CryptoKey> {
  const cached = keyCache.get(privateKey);
  if (cached) return cached;
  const pub = b64uDecode(publicKey);
  if (pub.byteLength !== 65 || pub[0] !== 4) throw new Error("VAPID_PUBLIC_KEY must be an uncompressed P-256 point");
  const jwk: JsonWebKey = { kty: "EC", crv: "P-256", x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)), d: privateKey, ext: true };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  keyCache.set(privateKey, key);
  return key;
}

export async function vapidHeader(vapid: VapidKeys, endpoint: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64uEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64uEncode(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: vapid.subject })));
  const unsigned = `${header}.${claims}`;
  const key = await vapidSigningKey(vapid.publicKey, vapid.privateKey);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned));
  return `vapid t=${unsigned}.${b64uEncode(sig)}, k=${vapid.publicKey}`;
}

/** Sends one push message. Returns the push service's HTTP status (404/410 = subscription is gone). */
export async function sendPush(vapid: VapidKeys, target: PushTarget, payload: unknown, ttlSeconds = 86400): Promise<number> {
  const body = await encryptPayload(target, enc.encode(JSON.stringify(payload)));
  const res = await fetch(target.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(vapid, target.endpoint),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttlSeconds),
      Urgency: "normal",
    },
    body,
  });
  await res.body?.cancel();
  return res.status;
}

/** Generates a VAPID key pair: { publicKey (raw point), privateKey (d) }, both base64url. */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  const raw = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  return { publicKey: b64uEncode(raw), privateKey: jwk.d! };
}
