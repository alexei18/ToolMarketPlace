import { and, desc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { productCategories, products, user, userInterests, type Database } from "@tm/db";
import { resolveLimits, type NotificationPayload } from "@tm/shared";
import type { Env } from "../env";
import { createNotifications, pushMessage, pushToUsers, type NewNotification } from "../lib/notify";

const DAY = 86400;
const BATCH_USERS = 150;

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

/**
 * Builds digests for users that are due: daily subscribers every day, weekly subscribers on Mondays.
 * Each user gets the newest products from their categories since their last digest (top N).
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

  const out: NewNotification[] = [];
  const nowSec = Math.floor(nowMs / 1000);
  // Query each user's candidates in D1 batches of 20 statements (one round trip each).
  for (let i = 0; i < batch.length; i += 20) {
    const group = batch.slice(i, i + 20);
    const queries = group.map((u) => {
      const window = u.frequency === "daily" ? DAY : 7 * DAY;
      const since = Math.max(u.lastDigestAt ?? 0, u.onboardedAt ?? 0, nowSec - window);
      return db
        .selectDistinct({ id: products.id, slug: products.slug, title: products.title, tagline: products.tagline, saves: products.saveCount, views: products.viewCount, publishedAt: products.publishedAt })
        .from(productCategories)
        .innerJoin(userInterests, and(eq(userInterests.categoryId, productCategories.categoryId), eq(userInterests.userId, u.id)))
        .innerJoin(products, and(eq(products.id, productCategories.productId), eq(products.status, "live")))
        .where(gt(productCategories.publishedAt, since))
        .orderBy(desc(products.saveCount), desc(products.viewCount), desc(products.publishedAt))
        .limit(limits.DIGEST_MAX_ITEMS);
    });
    const results = await db.batch(queries as [(typeof queries)[number], ...(typeof queries)[number][]]);
    group.forEach((u, idx) => {
      const rows = results[idx] ?? [];
      if (rows.length === 0) return;
      const payload: NotificationPayload = {
        kind: "digest",
        frequency: u.frequency === "daily" ? "daily" : "weekly",
        products: rows.map((r) => ({ slug: r.slug, title: r.title, tagline: r.tagline })),
      };
      out.push({ userId: u.id, type: "digest", payload });
    });
  }

  await createNotifications(db, out);
  const ids = batch.map((u) => u.id);
  for (let i = 0; i < ids.length; i += 90) {
    await db
      .update(user)
      .set({ lastDigestAt: nowSec })
      .where(inArray(user.id, ids.slice(i, i + 90)));
  }
  const messages = new Map(out.map((n) => [n.userId, pushMessage(env, n.payload)]));
  const { sent } = await pushToUsers(db, env, messages);
  return { processed: batch.length, notified: out.length, pushed: sent, remaining: due.length > BATCH_USERS };
}
