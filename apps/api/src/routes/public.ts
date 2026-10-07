import { and, asc, count, desc, eq, exists, gt, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { categories, perks, productCategories, products, reports, roadmapItems, roadmapVotes, saves, user, userInterests } from "@tm/db";
import {
  PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  nowSec,
  searchQuerySchema,
  type CategoryDTO,
  type HomeDTO,
  type MakerProfileDTO,
  type Page,
  type ProductCardDTO,
  type ViewerProductStateDTO,
} from "@tm/shared";
import type { AppEnv } from "../env";
import { bump, flushCounters, shouldFlush } from "../lib/counters";
import { notFound } from "../lib/errors";
import { findLiveProduct } from "../lib/lookup";
import { loadCards, loadDetail, perkAvailableSql, viewerPerks } from "../lib/products";
import { query } from "../lib/validate";
import { requireUser } from "../middleware";

const app = new Hono<AppEnv>();

const live = eq(products.status, "live");

function pcCursor(cursor: string | undefined): SQL | undefined {
  const cur = decodeCursor(cursor);
  return cur ? sql`(${productCategories.publishedAt}, ${productCategories.productId}) < (${cur.time}, ${cur.id})` : undefined;
}

function productCursor(cursor: string | undefined): SQL | undefined {
  const cur = decodeCursor(cursor);
  return cur ? sql`(${products.publishedAt}, ${products.id}) < (${cur.time}, ${cur.id})` : undefined;
}

async function categoryList(db: AppEnv["Variables"]["db"]): Promise<CategoryDTO[]> {
  const [cats, counts] = await db.batch([
    db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)),
    db
      .select({ categoryId: productCategories.categoryId, n: count() })
      .from(productCategories)
      .innerJoin(products, and(eq(products.id, productCategories.productId), live))
      .groupBy(productCategories.categoryId),
  ]);
  const byId = new Map(counts.map((c) => [c.categoryId, c.n]));
  return cats.map((c) => ({ id: c.id, slug: c.slug, name: c.name, description: c.description, sortOrder: c.sortOrder, productCount: byId.get(c.id) ?? 0 }));
}

app.get("/categories", async (c) => {
  c.header("Cache-Control", "public, max-age=60");
  return c.json({ items: await categoryList(c.get("db")) });
});

app.get("/categories/:slug", async (c) => {
  const db = c.get("db");
  const cat = await db.select().from(categories).where(eq(categories.slug, c.req.param("slug"))).get();
  if (!cat) throw notFound("Category not found");
  return c.json({ id: cat.id, slug: cat.slug, name: cat.name, description: cat.description, sortOrder: cat.sortOrder } satisfies CategoryDTO);
});

/** Products in a category, newest first. Visitors only see the newest N (VISITOR_CATEGORY_LIMIT). */
app.get("/categories/:slug/products", async (c) => {
  const db = c.get("db");
  const viewer = c.get("user");
  const cursor = c.req.query("cursor");
  const cat = await db.select().from(categories).where(eq(categories.slug, c.req.param("slug"))).get();
  if (!cat) throw notFound("Category not found");

  const visitorLimit = c.get("limits").VISITOR_CATEGORY_LIMIT;
  if (!viewer && cursor) return c.json({ items: [], nextCursor: null, limited: true } satisfies Page<ProductCardDTO>);
  const limit = viewer ? PAGE_SIZE : visitorLimit;

  const rows = await db
    .select({ id: productCategories.productId, t: productCategories.publishedAt })
    .from(productCategories)
    .innerJoin(products, and(eq(products.id, productCategories.productId), live))
    .where(and(eq(productCategories.categoryId, cat.id), pcCursor(cursor)))
    .orderBy(desc(productCategories.publishedAt), desc(productCategories.productId))
    .limit(limit + 1);
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  const items = await loadCards(db, c.env, page.map((r) => r.id));
  const last = page[page.length - 1];
  return c.json({
    items,
    nextCursor: viewer && more && last ? encodeCursor(last.t, last.id) : null,
    limited: !viewer && more,
  } satisfies Page<ProductCardDTO>);
});

/** Newest products across all categories. */
app.get("/products", async (c) => {
  const db = c.get("db");
  const viewer = c.get("user");
  const cursor = c.req.query("cursor");
  if (!viewer && cursor) return c.json({ items: [], nextCursor: null, limited: true } satisfies Page<ProductCardDTO>);
  const limit = viewer ? PAGE_SIZE : c.get("limits").VISITOR_CATEGORY_LIMIT;
  const rows = await db
    .select({ id: products.id, t: products.publishedAt })
    .from(products)
    .where(and(live, productCursor(cursor)))
    .orderBy(desc(products.publishedAt), desc(products.id))
    .limit(limit + 1);
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return c.json({
    items: await loadCards(db, c.env, page.map((r) => r.id)),
    nextCursor: viewer && more && last ? encodeCursor(last.t, last.id) : null,
    limited: !viewer && more,
  } satisfies Page<ProductCardDTO>);
});

/** Home page: products launched in the last 24 h, the latest ones, and categories by size. */
app.get("/home", async (c) => {
  const db = c.get("db");
  const since = nowSec() - 86400;
  const [todayRows, recentRows, total] = await db.batch([
    db
      .select({ id: products.id })
      .from(products)
      .where(and(live, gt(products.publishedAt, since)))
      .orderBy(desc(products.publishedAt), desc(products.id))
      .limit(12),
    db.select({ id: products.id }).from(products).where(live).orderBy(desc(products.publishedAt), desc(products.id)).limit(24),
    db.select({ n: count() }).from(products).where(live),
  ]);
  const todayIds = todayRows.map((r) => r.id);
  const recentIds = recentRows.map((r) => r.id).filter((id) => !todayIds.includes(id)).slice(0, 12);
  const [cards, cats] = await Promise.all([loadCards(db, c.env, [...todayIds, ...recentIds]), categoryList(db)]);
  const byId = new Map(cards.map((p) => [p.id, p]));
  const body: HomeDTO = {
    totalProducts: total[0]?.n ?? 0,
    today: todayIds.map((id) => byId.get(id)).filter((p): p is ProductCardDTO => !!p),
    recent: recentIds.map((id) => byId.get(id)).filter((p): p is ProductCardDTO => !!p),
    categories: [...cats].sort((a, b) => (b.productCount ?? 0) - (a.productCount ?? 0) || a.sortOrder - b.sortOrder),
  };
  return c.json(body);
});

/** Personal feed: newest products in the categories the user follows. */
app.get("/feed", async (c) => {
  const viewer = requireUser(c);
  const db = c.get("db");
  const cursor = c.req.query("cursor");
  const interests = await db.select({ id: userInterests.categoryId }).from(userInterests).where(eq(userInterests.userId, viewer.id)).all();
  let rows: { id: string; t: number }[];
  if (interests.length === 0) {
    rows = await db
      .select({ id: products.id, t: products.publishedAt })
      .from(products)
      .where(and(live, productCursor(cursor)))
      .orderBy(desc(products.publishedAt), desc(products.id))
      .limit(PAGE_SIZE + 1);
  } else {
    rows = await db
      .selectDistinct({ id: productCategories.productId, t: productCategories.publishedAt })
      .from(productCategories)
      .innerJoin(userInterests, and(eq(userInterests.categoryId, productCategories.categoryId), eq(userInterests.userId, viewer.id)))
      .innerJoin(products, and(eq(products.id, productCategories.productId), live))
      .where(pcCursor(cursor))
      .orderBy(desc(productCategories.publishedAt), desc(productCategories.productId))
      .limit(PAGE_SIZE + 1);
  }
  const more = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  return c.json({
    items: await loadCards(db, c.env, page.map((r) => r.id)),
    nextCursor: more && last ? encodeCursor(last.t, last.id) : null,
  } satisfies Page<ProductCardDTO>);
});

/** Turns user input into a safe FTS5 query: up to 8 terms, each a quoted prefix match. */
export function ftsQuery(q: string): string | null {
  const terms = q.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.slice(0, 8) ?? [];
  if (terms.length === 0) return null;
  return terms.map((t) => `"${t}"*`).join(" ");
}

app.get("/search", async (c) => {
  const db = c.get("db");
  const viewer = c.get("user");
  const params = query(c, searchQuerySchema);
  const offset = params.cursor ? Math.max(0, Number(params.cursor) || 0) : 0;
  if (!viewer && offset > 0) return c.json({ items: [], nextCursor: null, limited: true } satisfies Page<ProductCardDTO>);
  const limit = PAGE_SIZE;
  const now = nowSec();

  const filters: (SQL | undefined)[] = [live];
  if (params.stage) filters.push(eq(products.stage, params.stage));
  if (params.pricing) filters.push(eq(products.pricing, params.pricing));
  if (params.feedback) filters.push(ne(products.feedbackMode, "off"));
  if (params.perk) {
    filters.push(exists(db.select({ x: sql`1` }).from(perks).where(and(eq(perks.productId, products.id), perkAvailableSql(now)))));
  }
  if (params.category) {
    filters.push(
      exists(
        db
          .select({ x: sql`1` })
          .from(productCategories)
          .innerJoin(categories, eq(categories.id, productCategories.categoryId))
          .where(and(eq(productCategories.productId, products.id), eq(categories.slug, params.category))),
      ),
    );
  }

  const match = ftsQuery(params.q);
  let ids: string[];
  if (match) {
    const rows = await db
      .select({ id: products.id })
      .from(sql`products_fts`)
      .innerJoin(products, sql`${products.id} = products_fts.product_id`)
      .where(and(sql`products_fts MATCH ${match}`, ...filters))
      .orderBy(sql`bm25(products_fts, 0.0, 10.0, 5.0, 1.0)`, desc(products.publishedAt))
      .limit(limit + 1)
      .offset(offset);
    ids = rows.map((r) => r.id);
  } else {
    const rows = await db
      .select({ id: products.id })
      .from(products)
      .where(and(...filters))
      .orderBy(desc(products.publishedAt), desc(products.id))
      .limit(limit + 1)
      .offset(offset);
    ids = rows.map((r) => r.id);
  }
  const more = ids.length > limit;
  const items = await loadCards(db, c.env, ids.slice(0, limit));
  return c.json({
    items,
    nextCursor: viewer && more ? String(offset + limit) : null,
    limited: !viewer && more,
  } satisfies Page<ProductCardDTO>);
});

app.get("/products/:slug", async (c) => {
  const detail = await loadDetail(c.get("db"), c.env, { slug: c.req.param("slug") });
  if (!detail) throw notFound("Product not found");
  return c.json(detail);
});

/** What the signed-in viewer sees differently on a product page (saved, claimed perks, votes, report). */
async function viewerState(c: Context<AppEnv>, productId: string): Promise<ViewerProductStateDTO | null> {
  const viewer = c.get("user");
  if (!viewer) return null;
  const db = c.get("db");
  const [saved, reported, votes, product] = await db.batch([
    db.select({ x: saves.productId }).from(saves).where(and(eq(saves.userId, viewer.id), eq(saves.productId, productId))),
    db.select({ x: reports.id }).from(reports).where(and(eq(reports.reporterId, viewer.id), eq(reports.productId, productId))),
    db
      .select({ id: roadmapVotes.itemId })
      .from(roadmapVotes)
      .innerJoin(roadmapItems, eq(roadmapItems.id, roadmapVotes.itemId))
      .where(and(eq(roadmapVotes.userId, viewer.id), eq(roadmapItems.productId, productId))),
    db.select({ makerId: products.makerId }).from(products).where(eq(products.id, productId)),
  ]);
  return {
    saved: saved.length > 0,
    reported: reported.length > 0,
    votes: votes.map((v) => v.id),
    isOwner: product[0]?.makerId === viewer.id,
    perks: await viewerPerks(db, productId, viewer.id),
  };
}

/** Records a page view (batched) and returns the viewer's personal state for the page. */
app.post("/products/:id/view", async (c) => {
  const product = await findLiveProduct(c.get("db"), c.req.param("id"));
  bump(product.id, "views");
  if (shouldFlush()) c.executionCtx.waitUntil(flushCounters(c.get("db")));
  return c.json({ viewer: await viewerState(c, product.id) });
});

app.get("/products/:id/viewer", async (c) => {
  const product = await findLiveProduct(c.get("db"), c.req.param("id"));
  return c.json({ viewer: await viewerState(c, product.id) });
});

/** Counts a click on the product link (batched). */
app.post("/products/:id/click", async (c) => {
  const product = await findLiveProduct(c.get("db"), c.req.param("id"));
  bump(product.id, "clicks");
  if (shouldFlush()) c.executionCtx.waitUntil(flushCounters(c.get("db")));
  return c.body(null, 204);
});

app.get("/makers/:username", async (c) => {
  const db = c.get("db");
  const maker = await db
    .select({ id: user.id, username: user.username, name: user.name, image: user.image, bio: user.bio, createdAt: user.createdAt, bannedAt: user.bannedAt })
    .from(user)
    .where(eq(user.username, c.req.param("username").toLowerCase()))
    .get();
  if (!maker || maker.bannedAt) throw notFound("Maker not found");
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.makerId, maker.id), live))
    .orderBy(desc(products.publishedAt))
    .limit(100);
  const body: MakerProfileDTO = {
    user: { id: maker.id, username: maker.username, name: maker.name, image: maker.image, bio: maker.bio, createdAt: Math.floor(maker.createdAt.getTime() / 1000) },
    products: await loadCards(db, c.env, rows.map((r) => r.id)),
  };
  return c.json(body);
});

/** Everything the sitemap needs, in one call. */
app.get("/sitemap", async (c) => {
  const db = c.get("db");
  const [prods, cats, makers] = await db.batch([
    db.select({ slug: products.slug, updatedAt: products.updatedAt }).from(products).where(live).orderBy(desc(products.publishedAt)).limit(45000),
    db.select({ slug: categories.slug }).from(categories).orderBy(asc(categories.sortOrder)),
    db
      .selectDistinct({ username: user.username })
      .from(user)
      .innerJoin(products, and(eq(products.makerId, user.id), live))
      .where(isNotNull(user.username))
      .limit(5000),
  ]);
  return c.json({ products: prods, categories: cats.map((x) => x.slug), makers: makers.map((m) => m.username) });
});

export default app;
