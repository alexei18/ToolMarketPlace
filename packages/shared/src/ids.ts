const ENCODING = "0123456789abcdefghjkmnpqrstvwxyz";

let lastTime = -1;
let lastRandom: number[] = [];

/**
 * Lowercase ULID: 48-bit timestamp + 80 random bits, sortable by creation time. Monotonic within
 * an isolate: ids made in the same millisecond increment the random part, so they keep their order.
 */
export function newId(now: number = Date.now()): string {
  let random: number[];
  if (now <= lastTime && lastRandom.length === 16) {
    now = lastTime;
    random = [...lastRandom];
    for (let i = 15; i >= 0; i--) {
      if (random[i]! < 31) {
        random[i]!++;
        break;
      }
      random[i] = 0;
    }
  } else {
    random = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b % 32);
  }
  lastTime = now;
  lastRandom = random;
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = ENCODING[t % 32] + time;
    t = Math.floor(t / 32);
  }
  return time + random.map((r) => ENCODING[r]).join("");
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
