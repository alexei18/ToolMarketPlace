const ENCODING = "0123456789abcdefghjkmnpqrstvwxyz";

/** Lowercase ULID: 48-bit timestamp + 80 random bits, sortable by creation time. */
export function newId(now: number = Date.now()): string {
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = ENCODING[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let rand = "";
  for (const b of bytes) rand += ENCODING[b % 32];
  return time + rand;
}

/** Random URL-safe token for domain verification and similar secrets. */
export function randomToken(bytes = 16): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Current Unix time in seconds. */
export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function slugify(input: string, max = 60): string {
  const s = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, max).replace(/-+$/g, "") || "product";
}
