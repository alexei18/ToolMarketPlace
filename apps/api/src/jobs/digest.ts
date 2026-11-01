import { and, desc, eq, exists, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { categories, productCategories, products, user, userInterests, type Database } from "@tm/db";
import { DIGEST_TOP_PER_CATEGORY, resolveLimits, type CategoryRef, type NotificationPayload } from "@tm/shared";
import type { Env } from "../env";
import { createNotifications, pushMessage, pushToUsers, type NewNotification } from "../lib/notify";

const DAY = 86400;
const BATCH_USERS = 150;
/** Candidates fetched per category; each user then keeps the ones newer than their last digest. */
const CANDIDATES_PER_CATEGORY = 50;

export function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000);
}

export interface DigestResult {
  processed: number;
  notified: number;
  pushed: number;
  remaining: boolean;
}

interface Candidate {
  slug: string;
  title: string;
  tagline: string;
  publishedAt: number;
  scoreWeek: number;
}

const toItems = (rows: Candidate[]) => rows.map((r) => ({ slug: r.slug, title: r.title, tagline: r.tagline }));

/**
 * Builds digests for users that are due: daily subscribers every day, weekly subscribers on Mondays.
 * Candidates are new products (published since the user's last digest) that meet the quality
 * conditions, ordered by Top this week. Weekly users get one notification per followed category
 * (the top DIGEST_TOP_PER_CATEGORY) and a single push; daily users get one combined list.
 * Users with nothing new get nothing. Runs in batches; the follow-up crons pick up the rest.
 */
export async function runDigest(env: Env, db: Database, nowMs: number = Date.now()): Promise<DigestResult> {
  const limits = resolveLimits(env);
  const today = startOfUtcDay(nowMs);
  const isMonday = new Date(nowMs).getUTCDay() === 1;
  const frequencies: ("daily" | "weekly")[] = isMonday ? ["daily", "weekly"] : ["daily"];

  const due = await db
    .select({ id: user.id, frequency: user.digestFrequency, lastDigestAt: user.lastDigestAt, onboardedAt: user.onboardedAt })
    .from(user)
    .where(and(inArray(user.digestFrequency, frequencies), isNull(user.bannedAt), or(isNull(user.lastDigestAt), lt(user.lastDigestAt, today))))
    .limit(BATCH_USERS + 1)
    .all();
  const batch = due.slice(0, BATCH_USERS);
  if (batch.length === 0) return { processed: 0, notified: 0, pushed: 0, remaining: false };
  const nowSec = Math.floor(nowMs / 1000);

  // Who follows what.
  const follows = new Map<string, string[]>();
  for (let i = 0; i < batch.length; i += 90) {
    const rows = await db
      .select({ userId: userInterests.userId, categoryId: userInterests.categoryId })
      .from(userInterests)
      .where(inArray(userInterests.userId, batch.slice(i, i + 90).map((u) => u.id)))
      .all();
    for (const r of rows) follows.set(r.userId, [...(follows.get(r.userId) ?? []), r.categoryId]);
  }
  const catIds = [...new Set([...follows.values()].flat())];
  if (catIds.length === 0) return markDone(db, batch, nowSec, due.length > BATCH_USERS);
  const catRows = await db.select({ id: categories.id, slug: categories.slug, name: categories.name }).from(categories).where(inArray(categories.id, catIds)).all();
  const catRef = new Map<string, CategoryRef>(catRows.map((c) => [c.id, { slug: c.slug, name: c.name }]));

  // The best new products per category, within the longest window any of these users needs.
  const window = batch.some((u) => u.frequency === "weekly") ? 7 * DAY : DAY;
  const queries = catIds.map((catId) =>
    db
      .select({ slug: products.slug, title: products.title, tagline: products.tagline, publishedAt: products.publishedAt, scoreWeek: products.scoreWeek })
      .from(products)
      .where(
        and(
          eq(products.status, "live"),
          eq(products.qualityOk, true),
          gt(products.publishedAt, nowSec - window),
          exists(db.select({ x: sql`1` }).from(productCategories).where(and(eq(productCategories.productId, products.id), eq(productCategories.categoryId, catId)))),
        ),
      )
      .orderBy(desc(products.scoreWeek), desc(products.publishedAt))
      .limit(CANDIDATES_PER_CATEGORY),
  );
  const candidates = new Map<string, Candidate[]>();
  for (let i = 0; i < queries.length; i += 20) {
    const group = queries.slice(i, i + 20);
    const results = await db.batch(group as [(typeof group)[number], ...(typeof group)[number][]]);
    results.forEach((rows, j) => candidates.set(catIds[i + j]!, rows));
  }

  const out: NewNotification[] = [];
  const pushes = new Map<string, ReturnType<typeof pushMessage>>();
  for (const u of batch) {
    const since = Math.max(u.lastDigestAt ?? 0, u.onboardedAt ?? 0, nowSec - (u.frequency === "daily" ? DAY : 7 * DAY));
    const perCategory = (follows.get(u.id) ?? [])
      .map((catId) => ({ category: catRef.get(catId)!, rows: (candidates.get(catId) ?? []).filter((r) => r.publishedAt > since).slice(0, DIGEST_TOP_PER_CATEGORY) }))
      .filter((x) => x.category && x.rows.length > 0);
    if (perCategory.length === 0) continue;

    if (u.frequency === "weekly") {
      const payloads: NotificationPayload[] = perCategory.map((x) => ({ kind: "digest", frequency: "weekly", category: x.category, products: toItems(x.rows) }));
      for (const payload of payloads) out.push({ userId: u.id, type: "digest", payload });
      // One push per user: the category whose best product ranks highest.
      const best = perCategory.reduce((a, b) => (b.rows[0]!.scoreWeek > a.rows[0]!.scoreWeek ? b : a));
      pushes.set(u.id, pushMessage(env, payloads[perCategory.indexOf(best)]!));
    } else {
      const seen = new Set<string>();
      const merged = perCategory
        .flatMap((x) => x.rows)
        .filter((r) => !seen.has(r.slug) && seen.add(r.slug))
        .sort((a, b) => b.scoreWeek - a.scoreWeek || b.publishedAt - a.publishedAt)
        .slice(0, limits.DIGEST_MAX_ITEMS);
      const payload: NotificationPayload = { kind: "digest", frequency: "daily", products: toItems(merged) };
      out.push({ userId: u.id, type: "digest", payload });
      pushes.set(u.id, pushMessage(env, payload));
    }
  }

  await createNotifications(db, out);
  const done = await markDone(db, batch, nowSec, due.length > BATCH_USERS);
  const { sent } = await pushToUsers(db, env, pushes);
  return { ...done, notified: out.length, pushed: sent };
}

async function markDone(db: Database, batch: { id: string }[], nowSec: number, remaining: boolean): Promise<DigestResult> {
  const ids = batch.map((u) => u.id);
  for (let i = 0; i < ids.length; i += 90) {
    await db
      .update(user)
      .set({ lastDigestAt: nowSec })
      .where(inArray(user.id, ids.slice(i, i + 90)));
  }
  return { processed: batch.length, notified: 0, pushed: 0, remaining };
}
