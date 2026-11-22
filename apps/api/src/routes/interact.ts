import { and, asc, count, desc, eq, gt, inArray, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { feedback, perkClaims, perkCodes, perks, products, reports, roadmapItems, roadmapVotes, user } from "@tm/db";
import {
  FEEDBACK_SIGNAL_MIN_CHARS,
  PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  feedbackCreateSchema,
  feedbackReplySchema,
  newId,
  normalizeHostname,
  normalizeUrl,
  nowSec,
  perkClaimSchema,
  publicReportSchema,
  reportCreateSchema,
  reportReference,
  roadmapItemCreateSchema,
  roadmapItemUpdateSchema,
  type FeedbackDTO,
  type Page,
  type RoadmapItemDTO,
  type RoadmapStatus,
} from "@tm/shared";
import { en } from "@tm/shared/copy";
import { z } from "zod";
import type { AppEnv, Env } from "../env";
import { productPaths, purgeWebPaths } from "../lib/cache";
import { ApiError, notFound } from "../lib/errors";
import { sendEmail } from "../lib/email";
import { canManage, findLiveProduct, findOwnedProduct, findProduct, type ProductRow } from "../lib/lookup";
import { recordAutoHide } from "../lib/moderation";
import { createNotifications } from "../lib/notify";
import { trackSignal } from "../lib/signals";
import { requireTurnstile } from "../lib/turnstile";
import { body } from "../lib/validate";
import { clientIp, requireUser, requireVerifiedUser } from "../middleware";

const app = new Hono<AppEnv>();
const DAY = 86400;

/* Perks */

app.post("/perks/:id/claim", async (c) => {
  const u = requireVerifiedUser(c);
  const db = c.get("db");
  const input = await body(c, perkClaimSchema);
  await requireTurnstile(c.env, input.turnstileToken, clientIp(c));
  const now = nowSec();

  const perk = await db.select().from(perks).where(eq(perks.id, c.req.param("id"))).get();
  if (!perk) throw notFound("Perk not found");
  const product = await findLiveProduct(db, perk.productId);

  const existing = await db
    .select({ claim: perkClaims, code: perkCodes.code })
    .from(perkClaims)
    .leftJoin(perkCodes, eq(perkCodes.id, perkClaims.codeId))
    .where(and(eq(perkClaims.perkId, perk.id), eq(perkClaims.userId, u.id)))
    .get();
  if (existing) {
    return c.json({ perkId: perk.id, code: existing.code ?? perk.sharedCode, redeemUrl: perk.redeemUrl, claimedAt: existing.claim.claimedAt, alreadyClaimed: true });
  }

  const today = await db
    .select({ n: count() })
    .from(perkClaims)
    .where(and(eq(perkClaims.userId, u.id), gt(perkClaims.claimedAt, now - DAY)))
    .get();
  if ((today?.n ?? 0) >= c.get("limits").PERK_CLAIMS_PER_DAY) throw new ApiError("LIMIT_REACHED", "You've reached today's perk limit. Come back tomorrow.");

  // Reserve one claim atomically; fails when the perk is inactive, expired or out of claims.
  const reserved = await db
    .update(perks)
    .set({ claimCount: sql`${perks.claimCount} + 1` })
    .where(
      and(
        eq(perks.id, perk.id),
        eq(perks.active, true),
        or(isNull(perks.expiresAt), gt(perks.expiresAt, now)),
        or(isNull(perks.maxClaims), sql`${perks.claimCount} < ${perks.maxClaims}`),
      ),
    )
    .returning({ n: perks.claimCount });
  if (reserved.length === 0) throw new ApiError("PERK_UNAVAILABLE", "This perk is no longer available.");
  const release = () =>
    db
      .update(perks)
      .set({ claimCount: sql`max(${perks.claimCount} - 1, 0)` })
      .where(eq(perks.id, perk.id));

  let code: { id: string; code: string } | null = null;
  if (perk.type === "unique_codes") {
    const taken = await db
      .update(perkCodes)
      .set({ claimedBy: u.id, claimedAt: now })
      .where(
        eq(
          perkCodes.id,
          sql`(SELECT ${perkCodes.id} FROM ${perkCodes} WHERE ${perkCodes.perkId} = ${perk.id} AND ${perkCodes.claimedAt} IS NULL ORDER BY ${perkCodes.id} LIMIT 1)`,
        ),
      )
      .returning({ id: perkCodes.id, code: perkCodes.code });
    code = taken[0] ?? null;
    if (!code) {
      await release();
      throw new ApiError("PERK_UNAVAILABLE", "All codes for this perk have been claimed.");
    }
  }

  const inserted = await db
    .insert(perkClaims)
    .values({ perkId: perk.id, userId: u.id, codeId: code?.id ?? null, claimedAt: now })
    .onConflictDoNothing()
    .returning({ perkId: perkClaims.perkId });
  if (inserted.length === 0) {
    // A parallel request claimed it first: give back what this one reserved.
    await release();
    if (code) await db.update(perkCodes).set({ claimedBy: null, claimedAt: null }).where(eq(perkCodes.id, code.id));
    throw new ApiError("ALREADY_CLAIMED", "You already claimed this perk.");
  }
  c.executionCtx.waitUntil(purgeWebPaths(c.env, [`/p/${product.slug}`]));
  trackSignal(c, product, "perk_claim");
  return c.json({ perkId: perk.id, code: code?.code ?? perk.sharedCode, redeemUrl: perk.redeemUrl, claimedAt: now, alreadyClaimed: false }, 201);
});

/* Feedback */

type FeedbackRow = typeof feedback.$inferSelect & { author: { id: string; username: string | null; name: string; image: string | null } | null; roadmapItemId?: string | null };

function feedbackDto(r: FeedbackRow): FeedbackDTO {
  return {
    id: r.id,
    productId: r.productId,
    type: r.type,
    body: r.body,
    isPublic: r.isPublic,
    makerReply: r.makerReply,
    resolvedAt: r.resolvedAt,
    createdAt: r.createdAt,
    author: r.author,
    roadmapItemId: r.roadmapItemId ?? null,
  };
}

/** Public feedback for everyone; the maker (and admins) also see private feedback; authors see their own. */
app.get("/products/:id/feedback", async (c) => {
  const db = c.get("db");
  const viewer = c.get("user");
  const product = await findProduct(db, c.req.param("id"));
  if (!product || (product.status !== "live" && !(viewer && canManage(viewer, product)))) throw notFound("Product not found");
  const manager = viewer && canManage(viewer, product);
  const cur = decodeCursor(c.req.query("cursor"));
  const filter = c.req.query("filter"); // maker dashboard: open | resolved

  const visibility: SQL | undefined = manager ? undefined : viewer ? or(eq(feedback.isPublic, true), eq(feedback.userId, viewer.id)) : eq(feedback.isPublic, true);
  const rows = await db
    .select({ f: feedback, author: { id: user.id, username: user.username, name: user.name, image: user.image }, roadmapItemId: roadmapItems.id })
    .from(feedback)
    // Left join: public feedback of deleted accounts has no author.
    .leftJoin(user, eq(user.id, feedback.userId))
    .leftJoin(roadmapItems, eq(roadmapItems.fromFeedbackId, feedback.id))
    .where(
      and(
        eq(feedback.productId, product.id),
        visibility,
        filter === "open" ? isNull(feedback.resolvedAt) : filter === "resolved" ? sql`${feedback.resolvedAt} IS NOT NULL` : undefined,
        cur ? sql`(${feedback.createdAt}, ${feedback.id}) < (${cur.time}, ${cur.id})` : undefined,
      ),
    )
    .orderBy(desc(feedback.createdAt), desc(feedback.id))
    .limit(PAGE_SIZE + 1);
  const more = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  return c.json({
    items: page.map((r) => feedbackDto({ ...r.f, author: r.author, roadmapItemId: r.roadmapItemId })),
    nextCursor: more && last ? encodeCursor(last.f.createdAt, last.f.id) : null,
    mode: product.feedbackMode,
  } satisfies Page<FeedbackDTO> & { mode: string });
});

app.post("/products/:id/feedback", async (c) => {
  const u = requireUser(c);
  const db = c.get("db");
  const input = await body(c, feedbackCreateSchema);
  const product = await findLiveProduct(db, c.req.param("id"));
  if (product.feedbackMode === "off") throw new ApiError("FEEDBACK_DISABLED", "This maker isn't collecting feedback right now.");
  if (product.makerId === u.id) throw new ApiError("FORBIDDEN", "You can't leave feedback on your own product.");
  const now = nowSec();
  const today = await db
    .select({ n: count() })
    .from(feedback)
    .where(and(eq(feedback.userId, u.id), gt(feedback.createdAt, now - DAY)))
    .get();
  if ((today?.n ?? 0) >= c.get("limits").FEEDBACK_PER_DAY) throw new ApiError("LIMIT_REACHED", "You've reached today's feedback limit.");

  const row = { id: newId(), productId: product.id, userId: u.id, type: input.type, body: input.body, isPublic: product.feedbackMode === "public", makerReply: null, resolvedAt: null, createdAt: now };
  await db.insert(feedback).values(row);
  if (input.body.length >= FEEDBACK_SIGNAL_MIN_CHARS) trackSignal(c, product, "feedback");
  if (row.isPublic) c.executionCtx.waitUntil(purgeWebPaths(c.env, [`/p/${product.slug}/feedback`]));
  return c.json(feedbackDto({ ...row, author: { id: u.id, username: u.username, name: u.name, image: u.image } }), 201);
});

async function ownedFeedback(c: Parameters<typeof requireUser>[0], id: string) {
  const u = requireUser(c);
  const db = c.get("db");
  const f = await db.select().from(feedback).where(eq(feedback.id, id)).get();
  if (!f) throw notFound("Feedback not found");
  const product = await findOwnedProduct(db, u, f.productId);
  return { f, product };
}

app.post("/feedback/:id/reply", async (c) => {
  const input = await body(c, feedbackReplySchema);
  const { f, product } = await ownedFeedback(c, c.req.param("id"));
  const db = c.get("db");
  await db.update(feedback).set({ makerReply: input.reply }).where(eq(feedback.id, f.id));
  if (f.userId && f.userId !== product.makerId) {
    await createNotifications(db, [
      { userId: f.userId, type: "feedback_reply", payload: { kind: "feedback_reply", productSlug: product.slug, productTitle: product.title, feedbackId: f.id, reply: input.reply.slice(0, 280) } },
    ]);
  }
  if (f.isPublic) c.executionCtx.waitUntil(purgeWebPaths(c.env, [`/p/${product.slug}/feedback`]));
  return c.json({ ok: true, makerReply: input.reply });
});

app.post("/feedback/:id/resolve", async (c) => {
  const input = await body(c, z.object({ resolved: z.boolean().default(true) }));
  const { f, product } = await ownedFeedback(c, c.req.param("id"));
  const resolvedAt = input.resolved ? nowSec() : null;
  await c.get("db").update(feedback).set({ resolvedAt }).where(eq(feedback.id, f.id));
  if (f.isPublic) c.executionCtx.waitUntil(purgeWebPaths(c.env, [`/p/${product.slug}/feedback`]));
  return c.json({ ok: true, resolvedAt });
});

/* Roadmap */

const STATUS_ORDER: Record<RoadmapStatus, number> = { in_progress: 0, planned: 1, shipped: 2 };

app.get("/products/:id/roadmap", async (c) => {
  const db = c.get("db");
  const viewer = c.get("user");
  const product = await findProduct(db, c.req.param("id"));
  const manager = viewer && product && canManage(viewer, product);
  if (!product || (product.status !== "live" && !manager)) throw notFound("Product not found");
  if (!product.roadmapEnabled && !manager) return c.json({ items: [], enabled: false });
  const items = await db.select().from(roadmapItems).where(eq(roadmapItems.productId, product.id)).orderBy(desc(roadmapItems.voteCount), asc(roadmapItems.createdAt)).all();
  let voted = new Set<string>();
  if (viewer && items.length) {
    const votes = await db
      .select({ id: roadmapVotes.itemId })
      .from(roadmapVotes)
      .where(and(eq(roadmapVotes.userId, viewer.id), inArray(roadmapVotes.itemId, items.map((i) => i.id).slice(0, 90))))
      .all();
    voted = new Set(votes.map((v) => v.id));
  }
  const out: RoadmapItemDTO[] = items
    .map((i) => ({
      id: i.id,
      productId: i.productId,
      title: i.title,
      description: i.description,
      status: i.status,
      voteCount: i.voteCount,
      createdAt: i.createdAt,
      fromFeedbackId: i.fromFeedbackId,
      ...(viewer ? { voted: voted.has(i.id) } : {}),
    }))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  return c.json({ items: out, enabled: product.roadmapEnabled });
});

app.post("/products/:id/roadmap", async (c) => {
  const u = requireUser(c);
  const db = c.get("db");
  const product = await findOwnedProduct(db, u, c.req.param("id"));
  const input = await body(c, roadmapItemCreateSchema);
  const total = await db.select({ n: count() }).from(roadmapItems).where(eq(roadmapItems.productId, product.id)).get();
  if ((total?.n ?? 0) >= 100) throw new ApiError("LIMIT_REACHED", "A roadmap can hold up to 100 items.");
  if (input.fromFeedbackId) {
    const f = await db
      .select({ id: feedback.id })
      .from(feedback)
      .where(and(eq(feedback.id, input.fromFeedbackId), eq(feedback.productId, product.id)))
      .get();
    if (!f) throw new ApiError("VALIDATION", "That feedback doesn't belong to this product.");
  }
  const row = { id: newId(), productId: product.id, title: input.title, description: input.description ?? null, status: input.status, voteCount: 0, fromFeedbackId: input.fromFeedbackId ?? null, createdAt: nowSec() };
  await db.insert(roadmapItems).values(row);
  if (!product.roadmapEnabled) await db.update(products).set({ roadmapEnabled: true }).where(eq(products.id, product.id));
  c.executionCtx.waitUntil(purgeWebPaths(c.env, [`/p/${product.slug}/roadmap`, `/p/${product.slug}`]));
  return c.json(row satisfies RoadmapItemDTO, 201);
});

app.patch("/products/:id/roadmap/:itemId", async (c) => {
  const u = requireUser(c);
  const db = c.get("db");
  const product = await findOwnedProduct(db, u, c.req.param("id"));
  const input = await body(c, roadmapItemUpdateSchema);
  const item = await db
    .select()
    .from(roadmapItems)
    .where(and(eq(roadmapItems.id, c.req.param("itemId")), eq(roadmapItems.productId, product.id)))
    .get();
  if (!item) throw notFound("Roadmap item not found");
  const patch: Partial<typeof roadmapItems.$inferInsert> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.status !== undefined) patch.status = input.status;
  if (Object.keys(patch).length) await db.update(roadmapItems).set(patch).where(eq(roadmapItems.id, item.id));

  // Tell the person whose feedback became this item that it shipped.
  if (input.status === "shipped" && item.status !== "shipped" && item.fromFeedbackId) {
    const f = await db.select({ userId: feedback.userId }).from(feedback).where(eq(feedback.id, item.fromFeedbackId)).get();
    if (f?.userId && f.userId !== product.makerId) {
      await createNotifications(db, [
        { userId: f.userId, type: "roadmap_shipped", payload: { kind: "roadmap_shipped", productSlug: product.slug, productTitle: product.title, itemTitle: patch.title ?? item.title } },
      ]);
    }
  }
  c.executionCtx.waitUntil(purgeWebPaths(c.env, [`/p/${product.slug}/roadmap`]));
  return c.json({ ...item, ...patch } satisfies RoadmapItemDTO);
});

app.delete("/products/:id/roadmap/:itemId", async (c) => {
  const u = requireUser(c);
  const db = c.get("db");
  const product = await findOwnedProduct(db, u, c.req.param("id"));
  await db.delete(roadmapItems).where(and(eq(roadmapItems.id, c.req.param("itemId")), eq(roadmapItems.productId, product.id)));
  c.executionCtx.waitUntil(purgeWebPaths(c.env, [`/p/${product.slug}/roadmap`]));
  return c.json({ ok: true });
});

async function votableItem(c: Parameters<typeof requireUser>[0], itemId: string) {
  const db = c.get("db");
  const item = await db.select().from(roadmapItems).where(eq(roadmapItems.id, itemId)).get();
  if (!item) throw notFound("Roadmap item not found");
  const product = await findLiveProduct(db, item.productId);
  if (!product.roadmapEnabled) throw new ApiError("ROADMAP_DISABLED", "This roadmap is closed.");
  return { item, product };
}

app.put("/roadmap/:itemId/vote", async (c) => {
  const u = requireUser(c);
  const db = c.get("db");
  const { item, product } = await votableItem(c, c.req.param("itemId"));
  const inserted = await db.insert(roadmapVotes).values({ itemId: item.id, userId: u.id }).onConflictDoNothing().returning({ id: roadmapVotes.itemId });
  let voteCount = item.voteCount;
  if (inserted.length) {
    trackSignal(c, product, "vote");
    const r = await db
      .update(roadmapItems)
      .set({ voteCount: sql`${roadmapItems.voteCount} + 1` })
      .where(eq(roadmapItems.id, item.id))
      .returning({ n: roadmapItems.voteCount });
    voteCount = r[0]?.n ?? voteCount + 1;
  }
  return c.json({ voted: true, voteCount });
});

app.delete("/roadmap/:itemId/vote", async (c) => {
  const u = requireUser(c);
  const db = c.get("db");
  const { item } = await votableItem(c, c.req.param("itemId"));
  const removed = await db
    .delete(roadmapVotes)
    .where(and(eq(roadmapVotes.itemId, item.id), eq(roadmapVotes.userId, u.id)))
    .returning({ id: roadmapVotes.itemId });
  let voteCount = item.voteCount;
  if (removed.length) {
    const r = await db
      .update(roadmapItems)
      .set({ voteCount: sql`max(${roadmapItems.voteCount} - 1, 0)` })
      .where(eq(roadmapItems.id, item.id))
      .returning({ n: roadmapItems.voteCount });
    voteCount = r[0]?.n ?? Math.max(0, voteCount - 1);
  }
  return c.json({ voted: false, voteCount });
});

/* Reports */

app.post("/products/:id/report", async (c) => {
  const u = requireUser(c);
  const db = c.get("db");
  const limits = c.get("limits");
  const input = await body(c, reportCreateSchema);
  await requireTurnstile(c.env, input.turnstileToken, clientIp(c));
  const product = await findLiveProduct(db, c.req.param("id"));
  if (product.makerId === u.id) throw new ApiError("FORBIDDEN", "You can't report your own product.");
  const now = nowSec();

  const [already, today] = await db.batch([
    db
      .select({ id: reports.id })
      .from(reports)
      .where(and(eq(reports.productId, product.id), eq(reports.reporterId, u.id))),
    db
      .select({ n: count() })
      .from(reports)
      .where(and(eq(reports.reporterId, u.id), gt(reports.createdAt, now - DAY))),
  ]);
  if (already.length) throw new ApiError("ALREADY_REPORTED", "You already reported this product.");
  if ((today[0]?.n ?? 0) >= limits.REPORTS_PER_DAY) throw new ApiError("LIMIT_REACHED", "You've reached today's report limit.");

  // Only reports from confirmed accounts older than 7 days count toward auto-hiding.
  const ageDays = (Date.now() - new Date(u.createdAt).getTime()) / 86_400_000;
  const counts = u.emailVerified && ageDays >= limits.REPORT_MIN_ACCOUNT_AGE_DAYS;

  const inserted = await db
    .insert(reports)
    .values({ id: newId(), productId: product.id, reporterId: u.id, reason: input.reason, note: input.note ?? null, counts, outcome: null, createdAt: now })
    .onConflictDoNothing()
    .returning({ id: reports.id });
  if (!inserted.length) throw new ApiError("ALREADY_REPORTED", "You already reported this product.");

  let hidden = false;
  if (counts) {
    const updated = await db
      .update(products)
      .set({ validReportCount: sql`${products.validReportCount} + 1` })
      .where(eq(products.id, product.id))
      .returning({ n: products.validReportCount });
    if ((updated[0]?.n ?? 0) >= limits.REPORT_HIDE_THRESHOLD) {
      const h = await db
        .update(products)
        .set({ status: "hidden", updatedAt: now })
        .where(and(eq(products.id, product.id), eq(products.status, "live")))
        .returning({ id: products.id });
      hidden = h.length > 0;
      if (hidden) {
        await recordAutoHide(c.env, db, product);
        c.executionCtx.waitUntil(purgeWebPaths(c.env, productPaths(product.slug)));
      }
    }
  }
  return c.json({ ok: true, counted: counts, hidden }, 201);
});

/**
 * Finds the listing a public report points at: a product page on this site (/p/<slug>), the
 * product's own URL, or a page on its website when only one listing uses that host.
 */
async function productFromLink(env: Env, db: AppEnv["Variables"]["db"], input: string): Promise<ProductRow | null> {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
  const page = url.pathname.match(/^\/p\/([^/]+)/);
  if (page && normalizeHostname(url.hostname) === normalizeHostname(new URL(env.WEB_ORIGIN).hostname)) return findProduct(db, decodeURIComponent(page[1]!));
  const normalized = normalizeUrl(input);
  if (!normalized) return null;
  const exact = await db.select().from(products).where(eq(products.urlNormalized, normalized)).get();
  if (exact) return exact;
  const origin = `https://${normalizeHostname(url.hostname)}`;
  const onHost = await db
    .select()
    .from(products)
    .where(or(eq(products.urlNormalized, origin), like(products.urlNormalized, `${origin}/%`)))
    .limit(2)
    .all();
  return onHost.length === 1 ? onHost[0]! : null;
}

/**
 * Public report form (/report, docs/LEGAL.md): no account needed. Public reports never count toward
 * hiding or ranking; they put the product in the admin review queue.
 */
app.post("/reports", async (c) => {
  const db = c.get("db");
  const input = await body(c, publicReportSchema);
  await requireTurnstile(c.env, input.turnstileToken, clientIp(c));
  const product = await productFromLink(c.env, db, input.url);
  if (!product || product.status === "removed") {
    throw new ApiError("VALIDATION", "We couldn't find a listing at that link. Paste the product's page on Tryworthy or its website.", { fields: { url: ["No listing found at this link."] } });
  }
  const id = newId();
  const email = input.email || null;
  await db.insert(reports).values({
    id,
    productId: product.id,
    reporterId: null,
    source: "public",
    reporterEmail: email,
    reason: input.reason,
    note: input.explanation,
    goodFaith: true,
    counts: false,
    outcome: null,
    createdAt: nowSec(),
  });
  const reference = reportReference(id);
  const t = en.publicReport;
  if (email) {
    c.executionCtx.waitUntil(
      sendEmail(c.env, { to: email, subject: `${c.env.SITE_NAME}: ${t.received}`, lines: [t.received, t.receivedText(product.title, reference)] }).catch((err) => console.error("[report] ack email failed", err)),
    );
  }
  return c.json({ reference, product: { slug: product.slug, title: product.title }, emailed: !!email }, 201);
});

export default app;
