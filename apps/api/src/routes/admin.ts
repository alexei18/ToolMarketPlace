import { and, asc, count, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { blockedDomains, categories, productCategories, products, reports, session, user } from "@tm/db";
import {
  banSchema,
  blockedDomainSchema,
  categoryUpsertSchema,
  nowSec,
  parseDomainInput,
  type MakerProductDTO,
  type ReviewQueueItemDTO,
} from "@tm/shared";
import type { AppEnv } from "../env";
import { productPaths, purgeWebPaths } from "../lib/cache";
import { ApiError, notFound } from "../lib/errors";
import { createNotifications } from "../lib/notify";
import { loadCards } from "../lib/products";
import { body } from "../lib/validate";
import { requireAdmin } from "../middleware";

const app = new Hono<AppEnv>();
type Db = AppEnv["Variables"]["db"];

app.use("/admin/*", async (c, next) => {
  requireAdmin(c);
  await next();
});

/** Products hidden automatically after reports (and products of banned makers), with their open reports. */
app.get("/admin/review-queue", async (c) => {
  const db = c.get("db");
  const rows = await db.select().from(products).where(eq(products.status, "hidden")).orderBy(desc(products.updatedAt)).limit(100).all();
  const ids = rows.map((r) => r.id);
  const cards = await loadCards(db, c.env, ids, { includeHidden: true });
  const reportRows = ids.length
    ? await db
        .select({ r: reports, reporter: { id: user.id, username: user.username, name: user.name, image: user.image } })
        .from(reports)
        .innerJoin(user, eq(user.id, reports.reporterId))
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
        .map((x) => ({ id: x.r.id, reason: x.r.reason, note: x.r.note, counts: x.r.counts, createdAt: x.r.createdAt, reporter: x.reporter })),
    };
  });
  return c.json({ items });
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

/** Bans a user: blocks sign-in, ends sessions and hides their live products. */
async function banUser(c: Context<AppEnv>, userId: string, reason: string): Promise<void> {
  const db = c.get("db");
  const now = nowSec();
  const live = await db
    .select({ id: products.id, slug: products.slug })
    .from(products)
    .where(and(eq(products.makerId, userId), eq(products.status, "live")))
    .all();
  await db.batch([
    db.update(user).set({ bannedAt: now }).where(and(eq(user.id, userId), isNull(user.bannedAt))),
    db.delete(session).where(eq(session.userId, userId)),
    db.update(products).set({ status: "hidden", updatedAt: now }).where(and(eq(products.makerId, userId), eq(products.status, "live"))),
  ]);
  console.log(`[admin] banned ${userId}: ${reason}`);
  if (live.length) c.executionCtx.waitUntil(purgeWebPaths(c.env, live.flatMap((p) => productPaths(p.slug))));
}

app.post("/admin/products/:id/restore", async (c) => {
  const db = c.get("db");
  const limits = c.get("limits");
  const p = await db.select().from(products).where(eq(products.id, c.req.param("id"))).get();
  if (!p) throw notFound("Product not found");
  const now = nowSec();
  // Restoring resets the report counter; the open reports are marked rejected.
  const reporters = await db
    .select({ id: reports.reporterId })
    .from(reports)
    .where(and(eq(reports.productId, p.id), isNull(reports.outcome)))
    .all();
  await db.batch([
    db.update(products).set({ status: "live", validReportCount: 0, updatedAt: now }).where(eq(products.id, p.id)),
    db
      .update(reports)
      .set({ outcome: "rejected" })
      .where(and(eq(reports.productId, p.id), isNull(reports.outcome))),
  ]);

  // Report abuse: ban reporters whose reports keep getting rejected.
  const ids = [...new Set(reporters.map((r) => r.id))];
  if (ids.length) {
    const abusers = await db
      .select({ id: reports.reporterId, n: count() })
      .from(reports)
      .where(and(inArray(reports.reporterId, ids.slice(0, 90)), eq(reports.outcome, "rejected")))
      .groupBy(reports.reporterId)
      .all();
    for (const a of abusers) if (a.n >= limits.USER_BAN_REJECTED_REPORTS) await banUser(c, a.id, "repeated rejected reports");
  }
  c.executionCtx.waitUntil(purgeWebPaths(c.env, productPaths(p.slug, await categorySlugs(db, p.id))));
  return c.json({ ok: true });
});

app.post("/admin/products/:id/remove", async (c) => {
  const db = c.get("db");
  const limits = c.get("limits");
  const p = await db.select().from(products).where(eq(products.id, c.req.param("id"))).get();
  if (!p) throw notFound("Product not found");
  const now = nowSec();
  await db.batch([
    db.update(products).set({ status: "removed", updatedAt: now }).where(eq(products.id, p.id)),
    db
      .update(reports)
      .set({ outcome: "upheld" })
      .where(and(eq(reports.productId, p.id), isNull(reports.outcome))),
  ]);
  await createNotifications(db, [
    { userId: p.makerId, type: "system", payload: { kind: "system", title: "A product was removed", body: `“${p.title}” was removed after review because it broke the listing rules.` } },
  ]);
  // Auto-ban makers after N products removed by review.
  const removed = await db
    .select({ n: count() })
    .from(products)
    .where(and(eq(products.makerId, p.makerId), eq(products.status, "removed")))
    .get();
  let banned = false;
  if ((removed?.n ?? 0) >= limits.MAKER_BAN_REMOVED_PRODUCTS) {
    await banUser(c, p.makerId, "too many removed products");
    banned = true;
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
  await banUser(c, target.id, input.reason ?? "manual");
  return c.json({ ok: true });
});

app.post("/admin/users/:id/unban", async (c) => {
  await c.get("db").update(user).set({ bannedAt: null }).where(eq(user.id, c.req.param("id")));
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
