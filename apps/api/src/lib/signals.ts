import { sql } from "drizzle-orm";
import { productSignals, type Database } from "@tm/db";
import { SIGNAL_MIN_ACCOUNT_AGE_DAYS, newId, signalDay, type SignalType } from "@tm/shared";
import type { Context } from "hono";
import type { AppEnv, SessionUser } from "../env";

export interface SignalProduct {
  id: string;
  makerId: string;
  domainId: string;
}

/**
 * The account-level rules of docs/RANKING.md: a confirmed email, an account at least 3 days old,
 * and not the product's maker. The domain-owner rule is checked inside the insert.
 */
export function signalEligible(u: SessionUser, product: SignalProduct, nowMs = Date.now()): boolean {
  if (!u.emailVerified || product.makerId === u.id) return false;
  return (nowMs - new Date(u.createdAt).getTime()) / 86_400_000 >= SIGNAL_MIN_ACCOUNT_AGE_DAYS;
}

/**
 * Inserts one raw signal, unless the account owns the product's verified domain. The unique indexes
 * drop duplicates (one per user, product and type per day; saves and perk claims once ever).
 * Returns true when a row was written.
 */
export async function recordSignal(db: Database, u: SessionUser, product: SignalProduct, type: SignalType, nowMs = Date.now()): Promise<boolean> {
  if (!signalEligible(u, product, nowMs)) return false;
  const now = Math.floor(nowMs / 1000);
  const res = await db.run(sql`
    INSERT INTO ${productSignals} (id, product_id, user_id, type, day, created_at)
    SELECT ${newId()}, ${product.id}, ${u.id}, ${type}, ${signalDay(now)}, ${now}
    WHERE NOT EXISTS (SELECT 1 FROM domains WHERE id = ${product.domainId} AND user_id = ${u.id} AND verified_at IS NOT NULL)
    ON CONFLICT DO NOTHING`);
  return (res.meta?.changes ?? 0) > 0;
}

/** Records a signal for the signed-in viewer after the response; a failed write never fails the request. */
export function trackSignal(c: Context<AppEnv>, product: SignalProduct, type: SignalType): void {
  const u = c.get("user");
  if (!u) return;
  c.executionCtx.waitUntil(recordSignal(c.get("db"), u, product, type).catch((err) => console.error("[signals]", type, err)));
}
