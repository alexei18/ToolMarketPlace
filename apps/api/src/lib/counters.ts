import { sql } from "drizzle-orm";
import { products, type Database } from "@tm/db";

/*
 * Views and clicks are summed in isolate memory and written in batches, so a busy product
 * costs one D1 write per flush instead of one per request. Counts held by an isolate that
 * is evicted before flushing are lost; that is an accepted trade-off for simple stats.
 */
const pending = new Map<string, { views: number; clicks: number }>();
let pendingTotal = 0;
let lastFlush = Date.now();

const FLUSH_EVERY = 25;
const FLUSH_AFTER_MS = 30_000;

export function bump(productId: string, kind: "views" | "clicks"): void {
  const entry = pending.get(productId) ?? { views: 0, clicks: 0 };
  entry[kind]++;
  pending.set(productId, entry);
  pendingTotal++;
}

export function shouldFlush(): boolean {
  return pendingTotal > 0 && (pendingTotal >= FLUSH_EVERY || Date.now() - lastFlush >= FLUSH_AFTER_MS);
}

export async function flushCounters(db: Database): Promise<number> {
  if (pending.size === 0) return 0;
  const entries = [...pending.entries()];
  pending.clear();
  pendingTotal = 0;
  lastFlush = Date.now();
  const statements = entries.map(([id, c]) =>
    db
      .update(products)
      .set({ viewCount: sql`${products.viewCount} + ${c.views}`, clickCount: sql`${products.clickCount} + ${c.clicks}` })
      .where(sql`${products.id} = ${id}`),
  );
  for (let i = 0; i < statements.length; i += 50) {
    const chunk = statements.slice(i, i + 50);
    await db.batch(chunk as [(typeof chunk)[number], ...(typeof chunk)[number][]]);
  }
  return entries.length;
}
