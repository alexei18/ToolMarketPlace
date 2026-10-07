import { inArray } from "drizzle-orm";
import { user, type Database } from "@tm/db";

export const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "api", "app", "auth", "dashboard", "feed", "help", "login", "logout", "me", "new",
  "null", "perks", "root", "saved", "search", "settings", "signup", "support", "system", "undefined", "www",
]);

export function usernameBase(input: string): string {
  const s = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20)
    .replace(/_+$/, "");
  return s.length >= 3 ? s : `${s || "user"}_${Math.random().toString(36).slice(2, 6)}`.slice(0, 20);
}

/** Picks `base`, or `base2`, `base3`… (falling back to a random suffix) so the username is free. */
export async function uniqueUsername(db: Database, raw: string): Promise<string> {
  const base = usernameBase(raw);
  const candidates = [base, ...Array.from({ length: 8 }, (_, i) => `${base}${i + 2}`)].filter((c) => !RESERVED_USERNAMES.has(c));
  const taken = new Set(
    (await db.select({ u: user.username }).from(user).where(inArray(user.username, candidates)).all()).map((r) => r.u),
  );
  const free = candidates.find((c) => !taken.has(c));
  return free ?? `${base.slice(0, 14)}_${Math.random().toString(36).slice(2, 8)}`;
}
