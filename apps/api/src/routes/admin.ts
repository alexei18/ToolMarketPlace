import { and, asc, count, desc, eq, exists, gt, gte, inArray, isNull, like, lt, or, sql, type SQLWrapper } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { blockedDomains, categories, moderationDecisions, productCategories, products, reports, reviewCases, user } from "@tm/db";
import {
  DECISION_ACTIONS,
  DECISION_TARGETS,
  PAGE_SIZE,
  REPORT_REASONS,
  REPORT_SOURCES,
  STAFF_PICK_DAYS,
  banSchema,
  blockedDomainSchema,
  categoryUpsertSchema,
  contestResolveSchema,
  decisionInputSchema,
  decodeCursor,
  encodeCursor,
  nowSec,
  parseDomainInput,
  reportReference,
  staffPickSchema,
  type AdminDecisionDTO,
  type AdminReportDTO,
  type MakerProductDTO,
  type Page,
  type ReviewCaseDTO,
  type ReviewQueueItemDTO,
  type StaffPickDTO,
} from "@tm/shared";
import { en } from "@tm/shared/copy";
import type { AppEnv } from "../env";
import { productPaths, purgeWebPaths } from "../lib/cache";
import { ApiError, notFound } from "../lib/errors";
import { findLiveProduct } from "../lib/lookup";
import { decideReports, decisionDto, removeProduct, resolveContest, restoreProduct, suspendAccount, unsuspendAccount, type Decision } from "../lib/moderation";
import { loadCards } from "../lib/products";
import { body } from "../lib/validate";
import { requireAdmin } from "../middleware";

const app = new Hono<AppEnv>();
type Db = AppEnv["Variables"]["db"];

app.use("/admin/*", async (c, next) => {
  requireAdmin(c);
  await next();
});

/**
 * Products hidden automatically after reports (and products of suspended makers), plus live products
 * with an open counting report (kept out of Top and Trending until decided) or an open public report,
 * with their open reports; open contests and signal spike cases.
 */
app.get("/admin/review-queue", async (c) => {
  const db = c.get("db");
  const openCounted = exists(
    db
      .select({ x: sql`1` })
      .from(reports)
      .where(and(eq(reports.productId, products.id), or(eq(reports.counts, true), eq(reports.source, "public")), isNull(reports.outcome))),
  );
  const rows = await db
    .select()
    .from(products)
    .where(or(eq(products.status, "hidden"), and(eq(products.status, "live"), openCounted)))
    .orderBy(desc(products.updatedAt))
    .limit(100)
    .all();
  const ids = rows.map((r) => r.id);
  const cards = await loadCards(db, c.env, ids, { includeHidden: true });
  const reportRows = ids.length
    ? await db
        .select({ r: reports, reporter: { id: user.id, username: user.username, name: user.name, image: user.image } })
        .from(reports)
        .leftJoin(user, eq(user.id, reports.reporterId))
        .where(and(inArray(reports.productId, ids.slice(0, 90)), isNull(reports.outcome)))
        .orderBy(desc(reports.createdAt))
        .all()
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items: ReviewQueueItemDTO[] = cards.map((card) => {
    const r = byId.get(card.id)!;
    const product: MakerProductDTO = { ...card, status: r.status, viewCount: r.viewCount, clickCount: r.clickCount, validReportCount: r.validReportCount };
    return {
      product,
      reports: reportRows
        .filter((x) => x.r.productId === card.id)
        .map((x) => ({ id: x.r.id, reason: x.r.reason, note: x.r.note, counts: x.r.counts, createdAt: x.r.createdAt, source: x.r.source, reporter: x.reporter, reporterEmail: x.r.reporterEmail })),
    };
  });
  const caseRows = await db.select().from(reviewCases).where(isNull(reviewCases.resolvedAt)).orderBy(desc(reviewCases.createdAt)).limit(100).all();
  const caseCards = new Map((await loadCards(db, c.env, [...new Set(caseRows.map((r) => r.productId))], { includeHidden: true })).map((p) => [p.id, p]));
  const cases: ReviewCaseDTO[] = caseRows.flatMap((r) => {
    const product = caseCards.get(r.productId);
    return product ? [{ id: r.id, kind: r.kind, details: JSON.parse(r.details), createdAt: r.createdAt, product }] : [];
  });
  const contestRows = await db
    .select()
    .from(moderationDecisions)
    .where(and(sql`${moderationDecisions.contestedAt} IS NOT NULL`, isNull(moderationDecisions.contestResolvedAt)))
    .orderBy(asc(moderationDecisions.contestedAt))
    .limit(100)
    .all();
  return c.json({ items, cases, contests: await adminDecisions(db, contestRows) });
});

/* Moderation: reports, decisions, contests and monthly counts (docs/LEGAL.md) */

/** Adds the people and products to decision rows for the admin screens. */
async function adminDecisions(db: Db, rows: Decision[]): Promise<AdminDecisionDTO[]> {
  const userIds = [...new Set(rows.flatMap((r) => [r.userId, r.decidedBy, r.contestResolvedBy]).filter((x): x is string => !!x))];
  const productIds = [...new Set(rows.map((r) => r.productId).filter((x): x is string => !!x))];
  const people = new Map<string, { id: string; name: string; email: string }>();
  for (let i = 0; i < userIds.length; i += 90) {
    for (const u of await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(inArray(user.id, userIds.slice(i, i + 90))).all()) people.set(u.id, u);
  }
  const items = new Map<string, { id: string; slug: string; title: string }>();
  for (let i = 0; i < productIds.length; i += 90) {
    for (const p of await db.select({ id: products.id, slug: products.slug, title: products.title }).from(products).where(inArray(products.id, productIds.slice(i, i + 90))).all()) items.set(p.id, p);
  }
  const ref = (id: string | null) => (id && people.get(id) ? { id, name: people.get(id)!.name } : null);
  return rows.map((r) => ({
    ...decisionDto(r, r.productId ? (items.get(r.productId) ?? null) : null),
    user: r.userId ? (people.get(r.userId) ?? null) : null,
    decidedBy: ref(r.decidedBy),
    contestResolvedBy: ref(r.contestResolvedBy),
  }));
}

/** `YYYY-MM` → [start, end) in unix seconds (UTC). */
function monthRange(month: string | undefined): [number, number] | null {
  const m = month?.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  return [Date.UTC(+m[1]!, +m[2]! - 1, 1) / 1000, Date.UTC(+m[1]!, +m[2]!, 1) / 1000];
}

const oneOf = <T extends string>(values: readonly T[], v: string | undefined): v is T => !!v && (values as readonly string[]).includes(v);

app.get("/admin/reports", async (c) => {
  const db = c.get("db");
  const q = c.req.query();
  const cur = decodeCursor(q.cursor);
  const range = monthRange(q.month);
  const rows = await db
    .select({ r: reports, product: { id: products.id, slug: products.slug, title: products.title, status: products.status }, reporter: { id: user.id, username: user.username, name: user.name, image: user.image } })
    .from(reports)
    .innerJoin(products, eq(products.id, reports.productId))
    .leftJoin(user, eq(user.id, reports.reporterId))
    .where(
      and(
        oneOf(REPORT_SOURCES, q.source) ? eq(reports.source, q.source) : undefined,
        oneOf(REPORT_REASONS, q.reason) ? eq(reports.reason, q.reason) : undefined,
        q.status === "open" ? isNull(reports.outcome) : q.status === "decided" ? sql`${reports.outcome} IS NOT NULL` : undefined,
        range ? and(gte(reports.createdAt, range[0]), lt(reports.createdAt, range[1])) : undefined,
        cur ? sql`(${reports.createdAt}, ${reports.id}) < (${cur.time}, ${cur.id})` : undefined,
      ),
    )
    .orderBy(desc(reports.createdAt), desc(reports.id))
    .limit(PAGE_SIZE + 1)
    .all();
  const page = rows.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  const items: AdminReportDTO[] = page.map(({ r, product, reporter }) => ({
    id: r.id,
    reference: reportReference(r.id),
    source: r.source,
    reason: r.reason,
    note: r.note,
    reporter,
    reporterEmail: r.reporterEmail,
    goodFaith: r.goodFaith,
    counts: r.counts,
    outcome: r.outcome,
    decidedAt: r.decidedAt,
    createdAt: r.createdAt,
    product,
  }));
  return c.json({ items, nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor(last.r.createdAt, last.r.id) : null } satisfies Page<AdminReportDTO>);
});

app.get("/admin/decisions", async (c) => {
  const db = c.get("db");
  const q = c.req.query();
  const cur = decodeCursor(q.cursor);
  const range = monthRange(q.month);
  const d = moderationDecisions;
  const rows = await db
    .select()
    .from(d)
    .where(
      and(
        oneOf(DECISION_TARGETS, q.target) ? eq(d.targetType, q.target) : undefined,
        oneOf(DECISION_ACTIONS, q.action) ? eq(d.action, q.action) : undefined,
        q.automated === "1" ? eq(d.automated, true) : q.automated === "0" ? eq(d.automated, false) : undefined,
        q.contested === "1" ? sql`${d.contestedAt} IS NOT NULL` : q.contested === "0" ? isNull(d.contestedAt) : undefined,
        range ? and(gte(d.createdAt, range[0]), lt(d.createdAt, range[1])) : undefined,
        cur ? sql`(${d.createdAt}, ${d.id}) < (${cur.time}, ${cur.id})` : undefined,
      ),
    )
    .orderBy(desc(d.createdAt), desc(d.id))
    .limit(PAGE_SIZE + 1)
    .all();
  const page = rows.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  return c.json({ items: await adminDecisions(db, page), nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor(last.createdAt, last.id) : null } satisfies Page<AdminDecisionDTO>);
});

/** Answers a contest. The reply notes when the same admin took the original decision (allowed, but recorded). */
app.post("/admin/decisions/:id/contest", async (c) => {
  const admin = requireAdmin(c);
  const db = c.get("db");
  const input = await body(c, contestResolveSchema);
  const d = await db.select().from(moderationDecisions).where(eq(moderationDecisions.id, c.req.param("id"))).get();
  if (!d || !d.contestedAt) throw notFound("Contest not found");
  if (d.contestResolvedAt) throw new ApiError("CONTEST_CLOSED", "This contest was already answered.");
  await resolveContest(c.env, db, d, admin.id, input);
  return c.json({ ok: true, sameAdmin: d.decidedBy === admin.id });
});

/** Monthly counts for transparency reporting, as CSV rows: month, metric, breakdown, count. */
app.get("/admin/moderation/monthly.csv", async (c) => {
  const db = c.get("db");
  const months = Math.min(Math.max(Number(c.req.query("months")) || 12, 1), 60);
  const now = new Date();
  const since = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1) / 1000;
  const month = (col: SQLWrapper) => sql<string>`strftime('%Y-%m', ${col}, 'unixepoch')`;
  const d = moderationDecisions;
  const [byReport, byDecision, contested, resolved, spikes] = await db.batch([
    db
      .select({ month: month(reports.createdAt), key: sql<string>`${reports.source} || '/' || ${reports.reason}`, n: count() })
      .from(reports)
      .where(gte(reports.createdAt, since))
      .groupBy(sql`1`, sql`2`),
    db
      .select({
        month: month(d.createdAt),
        key: sql<string>`${d.targetType} || '/' || ${d.action} || '/' || ${d.trigger} || '/' || (CASE WHEN ${d.automated} THEN 'automated' ELSE 'manual' END)`,
        n: count(),
      })
      .from(d)
      .where(gte(d.createdAt, since))
      .groupBy(sql`1`, sql`2`),
    db
      .select({ month: month(d.contestedAt), key: sql<string>`${d.targetType}`, n: count() })
      .from(d)
      .where(gte(d.contestedAt, since))
      .groupBy(sql`1`, sql`2`),
    db
      .select({ month: month(d.contestResolvedAt), key: sql<string>`${d.targetType} || '/' || ${d.contestOutcome}`, n: count() })
      .from(d)
      .where(gte(d.contestResolvedAt, since))
      .groupBy(sql`1`, sql`2`),
    db
      .select({ month: month(reviewCases.createdAt), key: sql<string>`${reviewCases.kind}`, n: count() })
      .from(reviewCases)
      .where(gte(reviewCases.createdAt, since))
      .groupBy(sql`1`, sql`2`),
  ]);
  const rows: string[] = [];
  const add = (metric: string, list: { month: string; key: string; n: number }[]) => {
    for (const r of list) rows.push(`${r.month},${metric},${r.key},${r.n}`);
  };
  add("reports", byReport);
  add("decisions", byDecision);
  add("contests_received", contested);
  add("contests_resolved", resolved);
  add("review_cases_opened", spikes);
  rows.sort();
  return c.body(["month,metric,breakdown,count", ...rows].join("\n") + "\n", 200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="moderation-${now.toISOString().slice(0, 7)}.csv"`,
    "cache-control": "private, no-store",
  });
});

/** Closes a review case; the product can rank again on the next ranking run. */
app.post("/admin/cases/:id/resolve", async (c) => {
  const admin = requireAdmin(c);
  const done = await c
    .get("db")
    .update(reviewCases)
    .set({ resolvedAt: nowSec(), resolvedBy: admin.id })
    .where(and(eq(reviewCases.id, c.req.param("id")), isNull(reviewCases.resolvedAt)))
    .returning({ id: reviewCases.id });
  if (!done.length) throw notFound("Case not found");
  return c.json({ ok: true });
});

/* Staff picks */

app.get("/admin/staff-picks", async (c) => {
  const db = c.get("db");
  const since = nowSec() - STAFF_PICK_DAYS * 86400;
  const rows = await db
    .select({ id: products.id, pickedAt: products.staffPickAt, note: products.staffPickNote })
    .from(products)
    .where(and(eq(products.status, "live"), gt(products.staffPickAt, since)))
    .orderBy(desc(products.staffPickAt))
    .all();
  const cards = new Map((await loadCards(db, c.env, rows.map((r) => r.id))).map((p) => [p.id, p]));
  const items: StaffPickDTO[] = rows.flatMap((r) => {
    const product = cards.get(r.id);
    return product && r.pickedAt ? [{ product, note: r.note, pickedAt: r.pickedAt, expiresAt: r.pickedAt + STAFF_PICK_DAYS * 86400 }] : [];
  });
  return c.json({ items });
});

/** Makes a live product (id or slug) a staff pick for STAFF_PICK_DAYS, with a short note. */
app.put("/admin/products/:id/staff-pick", async (c) => {
  const db = c.get("db");
  const input = await body(c, staffPickSchema);
  const p = await findLiveProduct(db, c.req.param("id"));
  await db.update(products).set({ staffPickAt: nowSec(), staffPickNote: input.note }).where(eq(products.id, p.id));
  c.executionCtx.waitUntil(purgeWebPaths(c.env, productPaths(p.slug, await categorySlugs(db, p.id))));
  return c.json({ ok: true, slug: p.slug });
});

app.delete("/admin/products/:id/staff-pick", async (c) => {
  const db = c.get("db");
  const p = await db.select().from(products).where(eq(products.id, c.req.param("id"))).get();
  if (!p) throw notFound("Product not found");
  await db.update(products).set({ staffPickAt: null, staffPickNote: null }).where(eq(products.id, p.id));
  c.executionCtx.waitUntil(purgeWebPaths(c.env, productPaths(p.slug, await categorySlugs(db, p.id))));
  return c.json({ ok: true });
});

async function categorySlugs(db: Db, productId: string): Promise<string[]> {
  const rows = await db
    .select({ slug: categories.slug })
    .from(productCategories)
    .innerJoin(categories, eq(categories.id, productCategories.categoryId))
    .where(eq(productCategories.productId, productId))
    .all();
  return rows.map((r) => r.slug);
}

app.post("/admin/products/:id/restore", async (c) => {
  const admin = requireAdmin(c);
  const db = c.get("db");
  const limits = c.get("limits");
  const p = await db.select().from(products).where(eq(products.id, c.req.param("id"))).get();
  if (!p) throw notFound("Product not found");
  // Restoring resets the report counter; the open reports are rejected and their reporters told.
  const reporters = await db
    .select({ id: reports.reporterId })
    .from(reports)
    .where(and(eq(reports.productId, p.id), isNull(reports.outcome)))
    .all();
  await restoreProduct(c.env, db, p, admin.id);
  await decideReports(c.env, db, p, "rejected", null);

  // Report abuse: suspend reporters whose reports keep getting rejected.
  const ids = [...new Set(reporters.map((r) => r.id).filter((id): id is string => !!id))];
  if (ids.length) {
    const abusers = await db
      .select({ id: reports.reporterId, n: count() })
      .from(reports)
      .where(and(inArray(reports.reporterId, ids.slice(0, 90)), eq(reports.outcome, "rejected")))
      .groupBy(reports.reporterId)
      .all();
    for (const a of abusers) {
      if (a.id && a.n >= limits.USER_BAN_REJECTED_REPORTS) {
        await suspendAccount(c.env, db, a.id, { rule: "reports", facts: en.moderation.autoBanRejectedReports(a.n), trigger: "rejected_reports", automated: true });
      }
    }
  }
  c.executionCtx.waitUntil(purgeWebPaths(c.env, productPaths(p.slug, await categorySlugs(db, p.id))));
  return c.json({ ok: true });
});

/** Removes a product after review. The maker gets a statement of reasons (rule + explanation). */
app.post("/admin/products/:id/remove", async (c) => {
  const admin = requireAdmin(c);
  const db = c.get("db");
  const limits = c.get("limits");
  const input = await body(c, decisionInputSchema);
  const p = await db.select().from(products).where(eq(products.id, c.req.param("id"))).get();
  if (!p) throw notFound("Product not found");
  await removeProduct(c.env, db, p, { ...input, adminId: admin.id });
  // Auto-suspend makers after N products removed by review.
  const removed = await db
    .select({ n: count() })
    .from(products)
    .where(and(eq(products.makerId, p.makerId), eq(products.status, "removed")))
    .get();
  const n = removed?.n ?? 0;
  let banned = false;
  if (n >= limits.MAKER_BAN_REMOVED_PRODUCTS) {
    banned = !!(await suspendAccount(c.env, db, p.makerId, { rule: "repeated", facts: en.moderation.autoBanRemovedProducts(n), trigger: "removed_products", automated: true }));
  }
  c.executionCtx.waitUntil(purgeWebPaths(c.env, productPaths(p.slug, await categorySlugs(db, p.id))));
  return c.json({ ok: true, makerBanned: banned });
});

app.get("/admin/users", async (c) => {
  const db = c.get("db");
  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  const rows = await db
    .select({ id: user.id, email: user.email, name: user.name, username: user.username, role: user.role, bannedAt: user.bannedAt, createdAt: user.createdAt })
    .from(user)
    .where(q ? or(like(user.email, `%${q}%`), like(user.username, `%${q}%`), like(user.name, `%${q}%`)) : undefined)
    .orderBy(desc(user.createdAt))
    .limit(50)
    .all();
  return c.json({ items: rows.map((r) => ({ ...r, createdAt: Math.floor(r.createdAt.getTime() / 1000) })) });
});

app.post("/admin/users/:id/ban", async (c) => {
  const input = await body(c, banSchema);
  const admin = requireAdmin(c);
  const target = await c.get("db").select({ id: user.id, role: user.role }).from(user).where(eq(user.id, c.req.param("id"))).get();
  if (!target) throw notFound("User not found");
  if (target.id === admin.id || target.role === "admin") throw new ApiError("FORBIDDEN", "Admins can't be banned here.");
  await suspendAccount(c.env, c.get("db"), target.id, { ...input, trigger: "admin", automated: false, adminId: admin.id });
  return c.json({ ok: true });
});

app.post("/admin/users/:id/unban", async (c) => {
  const admin = requireAdmin(c);
  await unsuspendAccount(c.env, c.get("db"), c.req.param("id"), admin.id);
  return c.json({ ok: true });
});

/* Categories */

app.post("/admin/categories", async (c) => {
  const db = c.get("db");
  const input = await body(c, categoryUpsertSchema);
  const exists = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, input.slug)).get();
  if (exists) throw new ApiError("VALIDATION", "A category with this slug exists.");
  const max = await db.select({ n: sql<number>`coalesce(max(${categories.sortOrder}), 0)` }).from(categories).get();
  const row = { id: `c_${input.slug}`, slug: input.slug, name: input.name, description: input.description ?? null, sortOrder: input.sortOrder ?? (max?.n ?? 0) + 10 };
  await db.insert(categories).values(row);
  return c.json(row, 201);
});

app.patch("/admin/categories/:id", async (c) => {
  const db = c.get("db");
  const input = await body(c, categoryUpsertSchema.partial());
  const cat = await db.select().from(categories).where(eq(categories.id, c.req.param("id"))).get();
  if (!cat) throw notFound("Category not found");
  if (input.slug && input.slug !== cat.slug) {
    const clash = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, input.slug)).get();
    if (clash) throw new ApiError("VALIDATION", "A category with this slug exists.");
  }
  const patch: Partial<typeof categories.$inferInsert> = {};
  if (input.slug) patch.slug = input.slug;
  if (input.name) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description ?? null;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if (Object.keys(patch).length) await db.update(categories).set(patch).where(eq(categories.id, cat.id));
  return c.json({ ...cat, ...patch });
});

app.delete("/admin/categories/:id", async (c) => {
  const db = c.get("db");
  const used = await db.select({ n: count() }).from(productCategories).where(eq(productCategories.categoryId, c.req.param("id"))).get();
  if ((used?.n ?? 0) > 0) throw new ApiError("FORBIDDEN", "Move this category's products before deleting it.");
  await db.delete(categories).where(eq(categories.id, c.req.param("id")));
  return c.json({ ok: true });
});

/* Blocked domains */

app.get("/admin/blocked-domains", async (c) => {
  const rows = await c.get("db").select().from(blockedDomains).orderBy(asc(blockedDomains.hostname)).all();
  return c.json({ items: rows });
});

app.post("/admin/blocked-domains", async (c) => {
  const input = await body(c, blockedDomainSchema);
  const hostname = parseDomainInput(input.hostname);
  if (!hostname) throw new ApiError("VALIDATION", "Enter a domain like spam.com.");
  await c
    .get("db")
    .insert(blockedDomains)
    .values({ hostname, reason: input.reason ?? null })
    .onConflictDoUpdate({ target: blockedDomains.hostname, set: { reason: input.reason ?? null } });
  return c.json({ hostname, reason: input.reason ?? null }, 201);
});

app.delete("/admin/blocked-domains/:hostname", async (c) => {
  await c.get("db").delete(blockedDomains).where(eq(blockedDomains.hostname, c.req.param("hostname").toLowerCase()));
  return c.json({ ok: true });
});

export default app;
