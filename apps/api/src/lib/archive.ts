import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import { categories, productCategories, productSignalDaily, products, type Database } from "@tm/db";
import {
  EPOCH_MONDAY,
  PAGE_SIZE,
  REPORT_PENALTY,
  SIGNAL_WEIGHTS,
  STAFF_PICK_BONUS,
  STAFF_PICK_DAYS,
  WEEK_ARCHIVE_MIN_LAUNCHES,
  WEEK_SECONDS,
  isoWeek,
  signalDay,
  weekIndex,
  weekStart,
  type IsoWeek,
  type SignalType,
  type WeekArchiveDTO,
} from "@tm/shared";
import type { Env } from "../env";
import { loadCards } from "./products";

/*
 * Weekly category archives (docs/SEO.md): for each completed week, the quality launches of that week
 * in a category, ranked by the Top this week formula applied to that week's signals. Archives exist
 * only for weeks with at least WEEK_ARCHIVE_MIN_LAUNCHES such launches, and not in pre-launch.
 */

/** A launch that may appear in an archive: live, meets the quality conditions. */
const eligible = and(eq(products.status, "live"), eq(products.qualityOk, true));

/** Week index of a product's launch, as SQL (integer division; the constants are ours, not input). */
const launchWeek = sql<number>`((${products.publishedAt} - ${sql.raw(String(EPOCH_MONDAY))}) / ${sql.raw(String(WEEK_SECONDS))})`;

const ref = (w: IsoWeek) => ({ slug: w.slug, year: w.year, week: w.week });

/** Launches of week `index` in a category, best first, or null when the week has no archive. */
export async function weekArchive(
  db: Database,
  env: Env,
  categoryId: string,
  index: number,
  now: number,
): Promise<Pick<WeekArchiveDTO, "items" | "previous"> | null> {
  const start = weekStart(index);
  const end = start + WEEK_SECONDS;
  if (end > now) return null;
  const inCategory = and(eq(productCategories.productId, products.id), eq(productCategories.categoryId, categoryId));
  const launchedThatWeek = and(eligible, gte(products.publishedAt, start), lt(products.publishedAt, end));

  const [launches, signals, earlier] = await db.batch([
    db
      .select({ id: products.id, publishedAt: products.publishedAt, staffPickAt: products.staffPickAt, validReportCount: products.validReportCount })
      .from(products)
      .innerJoin(productCategories, inCategory)
      .where(launchedThatWeek),
    db
      .select({ id: productSignalDaily.productId, type: productSignalDaily.type, n: sql<number>`sum(${productSignalDaily.count})` })
      .from(productSignalDaily)
      .innerJoin(products, eq(products.id, productSignalDaily.productId))
      .innerJoin(productCategories, inCategory)
      .where(and(launchedThatWeek, gte(productSignalDaily.day, signalDay(start)), lt(productSignalDaily.day, signalDay(end))))
      .groupBy(productSignalDaily.productId, productSignalDaily.type),
    db
      .select({ w: launchWeek })
      .from(products)
      .innerJoin(productCategories, inCategory)
      .where(and(eligible, lt(products.publishedAt, start)))
      .groupBy(launchWeek)
      .having(gte(count(), WEEK_ARCHIVE_MIN_LAUNCHES))
      .orderBy(desc(launchWeek))
      .limit(1),
  ]);
  if (launches.length < WEEK_ARCHIVE_MIN_LAUNCHES) return null;

  const points = new Map<string, number>();
  for (const s of signals) points.set(s.id, (points.get(s.id) ?? 0) + SIGNAL_WEIGHTS[s.type as SignalType] * Number(s.n));
  // Same formula as Top this week. A staff pick counts when it was active at some point that week;
  // only the latest pick is stored, so an earlier pick that a later one replaced no longer counts.
  const score = (p: (typeof launches)[number]) =>
    (points.get(p.id) ?? 0) +
    (p.staffPickAt !== null && p.staffPickAt < end && p.staffPickAt + STAFF_PICK_DAYS * 86400 > start ? STAFF_PICK_BONUS : 0) -
    REPORT_PENALTY * p.validReportCount;
  const ranked = launches
    .map((p) => ({ ...p, score: score(p) }))
    .sort((a, b) => b.score - a.score || b.publishedAt - a.publishedAt || (a.id < b.id ? 1 : -1))
    .slice(0, PAGE_SIZE);

  const prev = earlier[0];
  return { items: await loadCards(db, env, ranked.map((p) => p.id)), previous: prev ? ref(isoWeek(Number(prev.w))) : null };
}

/** Every archived week, per category, for the sitemap. */
export async function archivedWeeks(db: Database, now: number): Promise<{ category: string; week: string }[]> {
  const rows = await db
    .select({ slug: categories.slug, w: launchWeek })
    .from(products)
    .innerJoin(productCategories, eq(productCategories.productId, products.id))
    .innerJoin(categories, eq(categories.id, productCategories.categoryId))
    .where(and(eligible, lt(products.publishedAt, weekStart(weekIndex(now)))))
    .groupBy(categories.slug, launchWeek)
    .having(gte(count(), WEEK_ARCHIVE_MIN_LAUNCHES))
    .orderBy(desc(launchWeek), categories.slug)
    .limit(45000)
    .all();
  return rows.map((r) => ({ category: r.slug, week: isoWeek(Number(r.w)).slug }));
}
