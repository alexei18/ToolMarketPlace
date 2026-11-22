import { and, desc, eq, exists, gt, gte, sql, type SQL } from "drizzle-orm";
import { perks, productCategories, products, userInterests, type Database } from "@tm/db";
import {
  JUST_LAUNCHED_EVERY,
  JUST_LAUNCHED_MAX_AGE_HOURS,
  decodeCursor,
  encodeCursor,
  nowSec,
  type Platform,
  type Pricing,
  type ProductCardDTO,
  type RankSort,
  type Stage,
} from "@tm/shared";
import type { Env } from "../env";
import { loadCards, perkAvailableSql } from "./products";

/** Which products a list covers: everything, one category, or the categories a user follows. */
export type ListScope = { categoryId: string } | { interestsOf: string } | null;

export interface ListFilters {
  ai?: boolean;
  pricing?: Pricing;
  stage?: Stage;
  perk?: boolean;
  platform?: Platform;
}

export interface ListResult {
  items: ProductCardDTO[];
  /** Continues after these items; null when there is nothing more. */
  nextCursor: string | null;
}

function conditions(db: Database, scope: ListScope, f: ListFilters, now: number): SQL[] {
  const out: SQL[] = [eq(products.status, "live")];
  if (scope && "categoryId" in scope) {
    out.push(exists(db.select({ x: sql`1` }).from(productCategories).where(and(eq(productCategories.productId, products.id), eq(productCategories.categoryId, scope.categoryId)))));
  } else if (scope) {
    out.push(
      exists(
        db
          .select({ x: sql`1` })
          .from(productCategories)
          .innerJoin(userInterests, and(eq(userInterests.categoryId, productCategories.categoryId), eq(userInterests.userId, scope.interestsOf)))
          .where(eq(productCategories.productId, products.id)),
      ),
    );
  }
  if (f.ai) out.push(eq(products.hasAi, true));
  if (f.pricing) out.push(eq(products.pricing, f.pricing));
  if (f.stage) out.push(eq(products.stage, f.stage));
  if (f.platform) out.push(sql`EXISTS (SELECT 1 FROM json_each(${products.platforms}) WHERE value = ${f.platform})`);
  if (f.perk) out.push(exists(db.select({ x: sql`1` }).from(perks).where(and(eq(perks.productId, products.id), perkAvailableSql(now)))));
  return out;
}

/**
 * Top this week (quality products by score_week), Trending (quality products with a trending
 * score, by score_trending) or New (every live product, newest first).
 *
 * In Top every JUST_LAUNCHED_EVERY-th card is the newest quality product launched in the last
 * 48 h that isn't already on the page; when there is none, the regular order fills the slot.
 * Top and Trending page by offset into the regular order (the cursor), New by publish time.
 */
export async function listProducts(
  db: Database,
  env: Env,
  opts: { scope: ListScope; sort: RankSort; filters: ListFilters; cursor?: string; limit: number; /** New only: launches from this time on */ since?: number },
): Promise<ListResult> {
  const now = nowSec();
  const base = conditions(db, opts.scope, opts.filters, now);
  const { limit } = opts;

  if (opts.sort === "new") {
    const cur = decodeCursor(opts.cursor);
    const rows = await db
      .select({ id: products.id, t: products.publishedAt })
      .from(products)
      .where(and(...base, opts.since ? gte(products.publishedAt, opts.since) : undefined, cur ? sql`(${products.publishedAt}, ${products.id}) < (${cur.time}, ${cur.id})` : undefined))
      .orderBy(desc(products.publishedAt), desc(products.id))
      .limit(limit + 1)
      .all();
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return { items: await loadCards(db, env, page.map((r) => r.id)), nextCursor: rows.length > limit && last ? encodeCursor(last.t, last.id) : null };
  }

  const offset = Math.max(0, Math.floor(Number(opts.cursor ?? 0)) || 0);
  const ranked = opts.sort === "top" ? [...base, eq(products.qualityOk, true)] : [...base, eq(products.qualityOk, true), gt(products.scoreTrending, 0)];
  const order = opts.sort === "top" ? desc(products.scoreWeek) : desc(products.scoreTrending);
  const [organic, fresh] = await db.batch([
    db
      .select({ id: products.id })
      .from(products)
      .where(and(...ranked))
      .orderBy(order, desc(products.publishedAt), desc(products.id))
      .limit(limit + 1)
      .offset(offset),
    db
      .select({ id: products.id })
      .from(products)
      .where(and(...base, eq(products.qualityOk, true), gte(products.publishedAt, now - JUST_LAUNCHED_MAX_AGE_HOURS * 3600)))
      .orderBy(desc(products.publishedAt), desc(products.id))
      .limit(opts.sort === "top" ? limit * 2 : 0),
  ]);

  const onPage = new Set(organic.slice(0, limit).map((r) => r.id));
  const slots = fresh.filter((r) => !onPage.has(r.id));
  const page: { id: string; justLaunched: boolean }[] = [];
  let used = 0;
  let next = 0;
  while (page.length < limit) {
    if (opts.sort === "top" && (page.length + 1) % JUST_LAUNCHED_EVERY === 0 && next < slots.length) {
      page.push({ id: slots[next++]!.id, justLaunched: true });
      continue;
    }
    if (used >= organic.length) break;
    page.push({ id: organic[used++]!.id, justLaunched: false });
  }

  const cards = await loadCards(db, env, page.map((p) => p.id));
  const launched = new Set(page.filter((p) => p.justLaunched).map((p) => p.id));
  return {
    items: cards.map((card) => (launched.has(card.id) ? { ...card, justLaunched: true } : card)),
    nextCursor: organic.length > used ? String(offset + used) : null,
  };
}
