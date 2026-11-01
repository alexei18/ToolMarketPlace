import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  accountDeletions,
  account as accountTable,
  categories,
  domains,
  feedback,
  moderationDecisions,
  notifications,
  perkClaims,
  perkCodes,
  perks,
  productCategories,
  productImages,
  productSignals,
  products,
  pushSubscriptions,
  reports,
  roadmapItems,
  roadmapVotes,
  saves,
  session,
  user,
  userInterests,
  verification,
  type Database,
} from "@tm/db";
import { EXPORT_LINK_HOURS, nowSec, randomToken } from "@tm/shared";
import type { Env } from "../env";
import { productPaths, purgeWebPaths } from "./cache";

const iso = (sec: number | null) => (sec == null ? null : new Date(sec * 1000).toISOString());
const isoDate = (d: Date | null) => (d ? new Date(d).toISOString() : null);

/** D1 collapses duplicate column names in batch results, so the product title gets its own name where another `title` is selected. */
const productTitle = sql<string>`${products.title}`.as("product_title");

/** Everything stored about one account, in a readable shape. Secrets (password hash, tokens, push keys) are left out. */
export async function buildExport(db: Database, userId: string, siteName: string) {
  const u = await db.select().from(user).where(eq(user.id, userId)).get();
  if (!u) throw new Error("user not found");
  const [interests, accounts, sessions, savedRows, feedbackRows, votes, claims, domainRows, productRows, reportRows, notificationRows, pushRows, signalRows, decisionRows] = await db.batch([
    db.select({ slug: categories.slug }).from(userInterests).innerJoin(categories, eq(categories.id, userInterests.categoryId)).where(eq(userInterests.userId, userId)),
    db.select({ providerId: accountTable.providerId, createdAt: accountTable.createdAt }).from(accountTable).where(eq(accountTable.userId, userId)),
    db.select({ createdAt: session.createdAt, expiresAt: session.expiresAt, ipAddress: session.ipAddress, userAgent: session.userAgent }).from(session).where(eq(session.userId, userId)),
    db
      .select({ productId: saves.productId, slug: products.slug, title: products.title, createdAt: saves.createdAt })
      .from(saves)
      .innerJoin(products, eq(products.id, saves.productId))
      .where(eq(saves.userId, userId))
      .orderBy(desc(saves.createdAt)),
    db
      .select({ f: feedback, slug: products.slug, title: products.title })
      .from(feedback)
      .innerJoin(products, eq(products.id, feedback.productId))
      .where(eq(feedback.userId, userId))
      .orderBy(desc(feedback.createdAt)),
    db
      .select({ itemId: roadmapVotes.itemId, item: roadmapItems.title, slug: products.slug, title: productTitle })
      .from(roadmapVotes)
      .innerJoin(roadmapItems, eq(roadmapItems.id, roadmapVotes.itemId))
      .innerJoin(products, eq(products.id, roadmapItems.productId))
      .where(eq(roadmapVotes.userId, userId)),
    db
      .select({ perkId: perkClaims.perkId, perk: perks.title, sharedCode: perks.sharedCode, code: perkCodes.code, slug: products.slug, title: productTitle, claimedAt: perkClaims.claimedAt })
      .from(perkClaims)
      .innerJoin(perks, eq(perks.id, perkClaims.perkId))
      .innerJoin(products, eq(products.id, perks.productId))
      .leftJoin(perkCodes, eq(perkCodes.id, perkClaims.codeId))
      .where(eq(perkClaims.userId, userId))
      .orderBy(desc(perkClaims.claimedAt)),
    db.select().from(domains).where(eq(domains.userId, userId)),
    db.select({ id: products.id, slug: products.slug, title: products.title, url: products.url, status: products.status, publishedAt: products.publishedAt }).from(products).where(eq(products.makerId, userId)),
    db
      .select({ productId: reports.productId, slug: products.slug, reason: reports.reason, note: reports.note, outcome: reports.outcome, createdAt: reports.createdAt })
      .from(reports)
      .innerJoin(products, eq(products.id, reports.productId))
      .where(eq(reports.reporterId, userId)),
    db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)),
    db.select({ endpoint: pushSubscriptions.endpoint, createdAt: pushSubscriptions.createdAt }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)),
    db
      .select({ productId: productSignals.productId, slug: products.slug, type: productSignals.type, day: productSignals.day, createdAt: productSignals.createdAt })
      .from(productSignals)
      .innerJoin(products, eq(products.id, productSignals.productId))
      .where(eq(productSignals.userId, userId))
      .orderBy(desc(productSignals.createdAt)),
    db.select().from(moderationDecisions).where(eq(moderationDecisions.userId, userId)).orderBy(desc(moderationDecisions.createdAt)),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    site: siteName,
    profile: {
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: u.emailVerified,
      image: u.image,
      username: u.username,
      bio: u.bio,
      role: u.role,
      digestFrequency: u.digestFrequency,
      createdAt: isoDate(u.createdAt),
      onboardedAt: iso(u.onboardedAt),
      termsVersion: u.termsVersion,
      termsAcceptedAt: iso(u.termsAcceptedAt),
      bannedAt: iso(u.bannedAt),
    },
    firstTouch: { utmSource: u.utmSource, utmCampaign: u.utmCampaign, utmContent: u.utmContent },
    signIn: {
      methods: accounts.map((a) => ({ provider: a.providerId, createdAt: isoDate(a.createdAt) })),
      sessions: sessions.map((s) => ({ createdAt: isoDate(s.createdAt), expiresAt: isoDate(s.expiresAt), ipAddress: s.ipAddress, userAgent: s.userAgent })),
    },
    interests: interests.map((i) => i.slug),
    saves: savedRows.map((s) => ({ product: s.slug, productTitle: s.title, savedAt: iso(s.createdAt) })),
    feedback: feedbackRows.map((r) => ({
      id: r.f.id,
      product: r.slug,
      productTitle: r.title,
      type: r.f.type,
      body: r.f.body,
      public: r.f.isPublic,
      makerReply: r.f.makerReply,
      resolvedAt: iso(r.f.resolvedAt),
      createdAt: iso(r.f.createdAt),
    })),
    roadmapVotes: votes.map((v) => ({ itemId: v.itemId, item: v.item, product: v.slug, productTitle: v.title })),
    claimedPerks: claims.map((p) => ({ perkId: p.perkId, perk: p.perk, code: p.code ?? p.sharedCode, product: p.slug, productTitle: p.title, claimedAt: iso(p.claimedAt) })),
    domains: domainRows.map((d) => ({ hostname: d.hostname, verificationMethod: d.method, verifiedAt: iso(d.verifiedAt), createdAt: iso(d.createdAt) })),
    products: productRows.map((p) => ({ id: p.id, slug: p.slug, title: p.title, url: p.url, status: p.status, publishedAt: iso(p.publishedAt) })),
    reports: reportRows.map((r) => ({ product: r.slug, reason: r.reason, note: r.note, outcome: r.outcome, createdAt: iso(r.createdAt) })),
    notifications: notificationRows.map((n) => ({ id: n.id, type: n.type, payload: JSON.parse(n.payload) as unknown, readAt: iso(n.readAt), createdAt: iso(n.createdAt) })),
    pushSubscriptions: pushRows.map((p) => ({ endpoint: p.endpoint, createdAt: iso(p.createdAt) })),
    rankingSignals: signalRows.map((s) => ({ product: s.slug, type: s.type, day: new Date(s.day * 86_400_000).toISOString().slice(0, 10), createdAt: iso(s.createdAt) })),
    moderationDecisions: decisionRows.map((d) => ({
      id: d.id,
      about: d.targetType,
      productId: d.productId,
      action: d.action,
      rule: d.rule,
      facts: d.facts,
      automated: d.automated,
      createdAt: iso(d.createdAt),
      reversedAt: iso(d.reversedAt),
      contest: d.contestedAt ? { body: d.contestBody, contestedAt: iso(d.contestedAt), outcome: d.contestOutcome, response: d.contestResponse, resolvedAt: iso(d.contestResolvedAt) } : null,
    })),
  };
}

export type UserDataExport = Awaited<ReturnType<typeof buildExport>>;

/** R2 prefix of a user's export files. Never served by /img; only GET /me/export/:token reads it. */
export const exportPrefix = (userId: string) => `exports/${userId}/`;
export const EXPORT_TOKEN_RE = /^[a-f0-9]{32}$/;

/** Writes the export to R2 under an unguessable key. Returns the download token and when the link expires (unix seconds). */
export async function storeExport(env: Env, userId: string, data: UserDataExport): Promise<{ token: string; expiresAt: number }> {
  const token = randomToken(16);
  await env.IMAGES_BUCKET.put(`${exportPrefix(userId)}${token}.json`, JSON.stringify(data, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "private, no-store" },
  });
  return { token, expiresAt: nowSec() + EXPORT_LINK_HOURS * 3600 };
}

/** Deletes R2 objects under a prefix (exports, OG images); returns how many. */
async function deletePrefix(bucket: R2Bucket, prefix: string, olderThanMs?: number): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    const keys = page.objects.filter((o) => olderThanMs === undefined || o.uploaded.getTime() < olderThanMs).map((o) => o.key);
    if (keys.length) await bucket.delete(keys);
    deleted += keys.length;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return deleted;
}

/** Retention: export files older than EXPORT_LINK_HOURS. */
export function deleteExpiredExports(env: Env, nowMs = Date.now()): Promise<number> {
  return deletePrefix(env.IMAGES_BUCKET, "exports/", nowMs - EXPORT_LINK_HOURS * 3_600_000);
}

/**
 * Deletes an account. Removes the user and everything tied to them (sessions, sign-in accounts,
 * interests, saves, votes, perk claims, reports, notifications, push subscriptions, ranking signals,
 * domains and the products they made). Public feedback stays without an author ("Deleted user");
 * private feedback is deleted. Only the time of deletion is kept.
 */
export async function deleteAccount(env: Env, db: Database, userId: string): Promise<void> {
  const [own, ownImages, ownCats] = await db.batch([
    db.select({ id: products.id, slug: products.slug }).from(products).where(eq(products.makerId, userId)),
    db
      .select({ key: productImages.r2Key })
      .from(productImages)
      .innerJoin(products, eq(products.id, productImages.productId))
      .where(eq(products.makerId, userId)),
    db
      .select({ slug: categories.slug })
      .from(productCategories)
      .innerJoin(products, eq(products.id, productCategories.productId))
      .innerJoin(categories, eq(categories.id, productCategories.categoryId))
      .where(eq(products.makerId, userId)),
  ]);
  const u = await db.select({ username: user.username }).from(user).where(eq(user.id, userId)).get();

  await db.batch([
    // Counters shown on other people's products drop with the saves and votes that go away.
    db
      .update(products)
      .set({ saveCount: sql`max(${products.saveCount} - 1, 0)` })
      .where(inArray(products.id, db.select({ id: saves.productId }).from(saves).where(eq(saves.userId, userId)))),
    db
      .update(roadmapItems)
      .set({ voteCount: sql`max(${roadmapItems.voteCount} - 1, 0)` })
      .where(inArray(roadmapItems.id, db.select({ id: roadmapVotes.itemId }).from(roadmapVotes).where(eq(roadmapVotes.userId, userId)))),
    db.delete(feedback).where(and(eq(feedback.userId, userId), eq(feedback.isPublic, false))),
    // Products don't cascade from the user (they reference the domain too); deleting them removes
    // their images, perks, feedback, roadmap, signals and daily totals.
    db.delete(products).where(eq(products.makerId, userId)),
    // Password reset tokens store the user id as their value.
    db.delete(verification).where(eq(verification.value, userId)),
    // Decisions about the user stay for the monthly counts, without the user or what they wrote.
    db.update(moderationDecisions).set({ contestBody: null }).where(eq(moderationDecisions.userId, userId)),
    // Cascades to everything else that references the user; public feedback keeps a null author.
    db.delete(user).where(eq(user.id, userId)),
    db.insert(accountDeletions).values({ deletedAt: nowSec() }),
  ]);

  // Files: export copies, the products' OG cards, and product images no other product uses.
  try {
    await deletePrefix(env.IMAGES_BUCKET, exportPrefix(userId));
    for (const p of own) await deletePrefix(env.IMAGES_BUCKET, `og/${p.id}-`);
    // Image keys are content hashes, so another product can share one. 90 keys per query (D1 binds at most 100).
    const keys = [...new Set(ownImages.map((i) => i.key))];
    for (let i = 0; i < keys.length; i += 90) {
      const chunk = keys.slice(i, i + 90);
      const stillUsed = new Set((await db.select({ key: productImages.r2Key }).from(productImages).where(inArray(productImages.r2Key, chunk)).all()).map((r) => r.key));
      const orphans = chunk.filter((k) => !stillUsed.has(k));
      if (orphans.length) await env.IMAGES_BUCKET.delete(orphans);
    }
  } catch (err) {
    console.error("[account] file cleanup failed", err);
  }

  const paths = own.flatMap((p) => productPaths(p.slug, ownCats.map((c) => c.slug)));
  if (u?.username) paths.push(`/m/${u.username}`);
  await purgeWebPaths(env, paths);
}
