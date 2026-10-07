/*
 * Password hashing with PBKDF2-SHA256 from Web Crypto. It runs natively in Workers, so it fits the
 * free plan's CPU budget, unlike a pure-JS scrypt. The iteration count is stored in each hash,
 * so it can be raised later (e.g. on the paid plan) without breaking existing passwords.
 */
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

const enc = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, KEY_BITS);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2_sha256$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  const [algo, iter, saltB64, hashB64] = hash.split("$");
  if (algo !== "pbkdf2_sha256" || !iter || !saltB64 || !hashB64) return false;
  const iterations = Number(iter);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10_000_000) return false;
  const expected = fromB64(hashB64);
  const actual = await derive(password, fromB64(saltB64), iterations);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}
