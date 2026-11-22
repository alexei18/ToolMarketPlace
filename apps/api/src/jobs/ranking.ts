import { and, asc, count, eq, gt, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { productImages, productSignalDaily, productSignals, products, reports, reviewCases, user, type Database } from "@tm/db";
import {
  AGGREGATE_LOOKBACK_DAYS,
  LINK_CHECKS_PER_RUN,
  LINK_TIMEOUT_MS,
  REPORT_PENALTY,
  SIGNAL_WEIGHTS,
  SPIKE_COOLDOWN_HOURS,
  SPIKE_MIN_SIGNALS,
  SPIKE_WINDOW_HOURS,
  SPIKE_YOUNG_ACCOUNT_DAYS,
  SPIKE_YOUNG_SHARE,
  STAFF_PICK_BONUS,
  TOP_WINDOW_DAYS,
  TRENDING_AGE_OFFSET_HOURS,
  TRENDING_GRAVITY,
  TRENDING_WINDOW_HOURS,
  newId,
  signalDay,
  staffPickActive,
  type SignalType,
} from "@tm/shared";
import { FetchError, safeFetch } from "../lib/fetcher";
import { linkAnswered, passesQuality, qualityChecks } from "../lib/quality";

/**
 * Counts raw signals into product_signal_daily for today and the day before (signals are dated
 * when they are inserted, so older days no longer change). Idempotent; rows whose count didn't
 * change are not rewritten. Returns the number of rows written.
 */
export async function aggregateSignals(db: Database, nowMs: number = Date.now()): Promise<number> {
  const since = signalDay(Math.floor(nowMs / 1000)) - AGGREGATE_LOOKBACK_DAYS;
  const res = await db.run(sql`
    INSERT INTO ${productSignalDaily} (product_id, day, type, count)
    SELECT product_id, day, type, count(*) FROM ${productSignals} WHERE day >= ${since}
    GROUP BY product_id, day, type
    ON CONFLICT (product_id, day, type) DO UPDATE SET count = excluded.count
    WHERE ${productSignalDaily}.count != excluded.count`);
  return res.meta?.changes ?? 0;
}

async function linkResponds(url: string): Promise<boolean> {
  try {
    const res = await safeFetch(url, { maxBytes: 256 * 1024, timeoutMs: LINK_TIMEOUT_MS, accept: "text/html,*/*" });
    return linkAnswered(res.status);
  } catch (err) {
    // A page bigger than we care to read still answered.
    return err instanceof FetchError && err.reason === "too_large";
  }
}

/** Checks the links of the live products checked longest ago (never-checked first). Returns how many failed. */
export async function checkLinks(db: Database, nowMs: number = Date.now()): Promise<{ checked: number; failed: number }> {
  const now = Math.floor(nowMs / 1000);
  const due = await db
    .select({ id: products.id, url: products.url })
    .from(products)
    .where(eq(products.status, "live"))
    .orderBy(asc(products.linkCheckedAt))
    .limit(LINK_CHECKS_PER_RUN)
    .all();
  if (due.length === 0) return { checked: 0, failed: 0 };
  const results = await Promise.all(due.map((p) => linkResponds(p.url)));
  const statements = due.map((p, i) =>
    db
      .update(products)
      .set(results[i] ? { linkFailures: 0, linkCheckedAt: now } : { linkFailures: sql`${products.linkFailures} + 1`, linkCheckedAt: now })
      .where(eq(products.id, p.id)),
  );
  await db.batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]]);
  return { checked: due.length, failed: results.filter((ok) => !ok).length };
}

/**
 * Opens a review case for live products that got at least SPIKE_MIN_SIGNALS signals in the window,
 * mostly from accounts younger than SPIKE_YOUNG_ACCOUNT_DAYS. The product stays visible; the open
 * case keeps it out of Top and Trending until an admin resolves it. Returns the number of cases opened.
 */
export async function openSpikeCases(db: Database, nowMs: number = Date.now()): Promise<number> {
  const now = Math.floor(nowMs / 1000);
  const since = now - SPIKE_WINDOW_HOURS * 3600;
  const youngSince = now - SPIKE_YOUNG_ACCOUNT_DAYS * 86400;
  const rows = await db
    .select({
      id: productSignals.productId,
      total: count(),
      young: sql<number>`sum(case when ${user.createdAt} > ${youngSince} then 1 else 0 end)`,
    })
    .from(productSignals)
    .innerJoin(user, eq(user.id, productSignals.userId))
    .innerJoin(products, and(eq(products.id, productSignals.productId), eq(products.status, "live")))
    .where(and(gte(productSignals.day, signalDay(since)), gte(productSignals.createdAt, since)))
    .groupBy(productSignals.productId)
    .having(gte(count(), SPIKE_MIN_SIGNALS))
    .all();
  const spikes = rows.filter((r) => Number(r.young) / r.total > SPIKE_YOUNG_SHARE);
  if (spikes.length === 0) return 0;

  const busy = await db
    .select({ id: reviewCases.productId })
    .from(reviewCases)
    .where(
      and(
        inArray(reviewCases.productId, spikes.map((s) => s.id).slice(0, 90)),
        or(isNull(reviewCases.resolvedAt), gt(reviewCases.resolvedAt, now - SPIKE_COOLDOWN_HOURS * 3600)),
      ),
    )
    .all();
  const skip = new Set(busy.map((b) => b.id));
  const open = spikes.filter((s) => !skip.has(s.id));
  if (open.length === 0) return 0;
  await db.insert(reviewCases).values(
    open.map((s) => ({
      id: newId(),
      productId: s.id,
      kind: "signal_spike" as const,
      details: JSON.stringify({ total: s.total, young: Number(s.young), windowHours: SPIKE_WINDOW_HOURS }),
      createdAt: now,
    })),
  );
  return open.length;
}

const points = (rows: { type: SignalType; n: number }[]) => rows.reduce((sum, r) => sum + SIGNAL_WEIGHTS[r.type] * Number(r.n), 0);
const round = (x: number) => Math.round(x * 1e4) / 1e4;

/** Recomputes quality_ok, score_week and score_trending of every live product; writes only rows that changed. */
export async function recomputeProducts(db: Database, nowMs: number = Date.now()): Promise<number> {
  const now = Math.floor(nowMs / 1000);
  const today = signalDay(now);
  const trendingSince = now - TRENDING_WINDOW_HOURS * 3600;
  const [rows, images, openReports, openCases, week, recent] = await db.batch([
    db
      .select({
        id: products.id,
        description: products.description,
        tagline: products.tagline,
        linkFailures: products.linkFailures,
        publishedAt: products.publishedAt,
        staffPickAt: products.staffPickAt,
        validReportCount: products.validReportCount,
        qualityOk: products.qualityOk,
        scoreWeek: products.scoreWeek,
        scoreTrending: products.scoreTrending,
      })
      .from(products)
      .where(eq(products.status, "live")),
    db.selectDistinct({ id: productImages.productId }).from(productImages),
    db
      .selectDistinct({ id: reports.productId })
      .from(reports)
      .where(and(eq(reports.counts, true), isNull(reports.outcome))),
    db.selectDistinct({ id: reviewCases.productId }).from(reviewCases).where(isNull(reviewCases.resolvedAt)),
    db
      .select({ id: productSignalDaily.productId, type: productSignalDaily.type, n: sql<number>`sum(${productSignalDaily.count})` })
      .from(productSignalDaily)
      .where(gte(productSignalDaily.day, today - (TOP_WINDOW_DAYS - 1)))
      .groupBy(productSignalDaily.productId, productSignalDaily.type),
    db
      .select({ id: productSignals.productId, type: productSignals.type, n: count() })
      .from(productSignals)
      .where(and(gte(productSignals.day, signalDay(trendingSince)), gte(productSignals.createdAt, trendingSince)))
      .groupBy(productSignals.productId, productSignals.type),
  ]);

  const hasImage = new Set(images.map((r) => r.id));
  const inReview = new Set([...openReports.map((r) => r.id), ...openCases.map((r) => r.id)]);
  const group = (xs: { id: string; type: SignalType; n: number }[]) => {
    const out = new Map<string, { type: SignalType; n: number }[]>();
    for (const x of xs) out.set(x.id, [...(out.get(x.id) ?? []), x]);
    return out;
  };
  const weekBy = group(week);
  const recentBy = group(recent);

  const statements = [];
  for (const p of rows) {
    const qualityOk = passesQuality(qualityChecks(p, { hasImage: hasImage.has(p.id), openReview: inReview.has(p.id) }));
    const scoreWeek = points(weekBy.get(p.id) ?? []) + (staffPickActive(p.staffPickAt, now) ? STAFF_PICK_BONUS : 0) - REPORT_PENALTY * p.validReportCount;
    const ageHours = Math.max(0, (now - p.publishedAt) / 3600);
    const scoreTrending = round(points(recentBy.get(p.id) ?? []) / Math.pow(ageHours + TRENDING_AGE_OFFSET_HOURS, TRENDING_GRAVITY));
    if (qualityOk === p.qualityOk && scoreWeek === p.scoreWeek && scoreTrending === p.scoreTrending) continue;
    statements.push(db.update(products).set({ qualityOk, scoreWeek, scoreTrending, rankedAt: now }).where(eq(products.id, p.id)));
  }
  for (let i = 0; i < statements.length; i += 50) {
    const chunk = statements.slice(i, i + 50);
    await db.batch(chunk as [(typeof chunk)[number], ...(typeof chunk)[number][]]);
  }
  return statements.length;
}

export interface RankingResult {
  aggregated: number;
  links: { checked: number; failed: number };
  casesOpened: number;
  productsUpdated: number;
}

/** The 30-minute job: aggregate signals, check a batch of links, open spike cases, then quality and scores. */
export async function runRanking(db: Database, nowMs: number = Date.now()): Promise<RankingResult> {
  const aggregated = await aggregateSignals(db, nowMs);
  const links = await checkLinks(db, nowMs);
  const casesOpened = await openSpikeCases(db, nowMs);
  const productsUpdated = await recomputeProducts(db, nowMs);
  return { aggregated, links, casesOpened, productsUpdated };
}
