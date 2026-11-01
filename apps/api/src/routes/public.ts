import { and, asc, count, desc, eq, exists, isNotNull, isNull, ne, sql, type SQL } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { categories, perks, productCategories, productImages, products, reports, roadmapItems, roadmapVotes, saves, user, userInterests } from "@tm/db";
import {
  CATEGORY_MIN_ELIGIBLE,
  HOME_TOP_MIN,
  NEW_PAGE_DAYS,
  PAGE_SIZE,
  PERKS_PAGE_MAX,
  RESERVED_COUNT_MIN,
  listQuerySchema,
  nowSec,
  parseWeek,
  searchQuerySchema,
  type CategoryDTO,
  type HomeDTO,
  type MakerProfileDTO,
  type Page,
  type ProductCardDTO,
  type PublicPerkDTO,
  type ViewerProductStateDTO,
  type WeekArchiveDTO,
} from "@tm/shared";
import type { AppEnv } from "../env";
import { archivedWeeks, weekArchive } from "../lib/archive";
import { bump, flushCounters, shouldFlush } from "../lib/counters";
import { ApiError, notFound } from "../lib/errors";
import { listProducts, type ListScope } from "../lib/listing";
import { findLiveProduct } from "../lib/lookup";
import { productOgImage } from "../lib/og";
import { configDate, isPrelaunch } from "../lib/prelaunch";
import { imageUrl, loadCards, loadDetail, perkAvailableSql, viewerPerks } from "../lib/products";
import { trackSignal } from "../lib/signals";
import { query } from "../lib/validate";
import { requireUser } from "../middleware";

const app = new Hono<AppEnv>();

const live = eq(products.status, "live");

/** Every category with its live product count; in pre-launch, thin categories are marked unlisted. */
async function categoryList(db: AppEnv["Variables"]["db"], prelaunch: boolean): Promise<CategoryDTO[]> {
  const [cats, counts] = await db.batch([
    db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)),
    db
      .select({ categoryId: productCategories.categoryId, n: count(), eligible: sql<number>`sum(${products.qualityOk})` })
      .from(productCategories)
      .innerJoin(products, and(eq(products.id, productCategories.productId), live))
      .groupBy(productCategories.categoryId),
  ]);
  const byId = new Map(counts.map((c) => [c.categoryId, c]));
  return cats.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    sortOrder: c.sortOrder,
    productCount: byId.get(c.id)?.n ?? 0,
    listed: !prelaunch || (byId.get(c.id)?.eligible ?? 0) >= CATEGORY_MIN_ELIGIBLE,
  }));
}

/** Site-wide state for pages that render without a session (e.g. /makers). */
app.get("/site", async (c) => {
  c.header("Cache-Control", "public, max-age=60");
  return c.json({
    prelaunch: await isPrelaunch(c.env, c.get("db")),
    makerAccessDate: configDate(c.env.MAKER_ACCESS_DATE),
    launchDate: configDate(c.env.LAUNCH_DATE),
  });
});

app.get("/categories", async (c) => {
  c.header("Cache-Control", "public, max-age=60");
  return c.json({ items: await categoryList(c.get("db"), await isPrelaunch(c.env, c.get("db"))) });
});

app.get("/categories/:slug", async (c) => {
  const db = c.get("db");
  const cat = await db.select().from(categories).where(eq(categories.slug, c.req.param("slug"))).get();
  if (!cat) throw notFound("Category not found");
  return c.json({ id: cat.id, slug: cat.slug, name: cat.name, description: cat.description, sortOrder: cat.sortOrder } satisfies CategoryDTO);
});

/**
 * A Top / Trending / New list with filters. Visitors only get the first VISITOR_CATEGORY_LIMIT
 * items and can't page; `resumeCursor` lets a cached visitor page hand "Load more" to members.
 */
async function rankedList(c: Context<AppEnv>, scope: ListScope, newSince?: number): Promise<Page<ProductCardDTO>> {
  const viewer = c.get("user");
  const params = query(c, listQuerySchema);
  if (!viewer && params.cursor) return { items: [], nextCursor: null, limited: true };
  const { sort, cursor, ...filters } = params;
  const limit = viewer ? PAGE_SIZE : c.get("limits").VISITOR_CATEGORY_LIMIT;
  const since = sort === "new" ? newSince : undefined;
  const { items, nextCursor } = await listProducts(c.get("db"), c.env, { scope, sort, filters, cursor, limit, since });
  return { items, nextCursor: viewer ? nextCursor : null, limited: !viewer && nextCursor !== null, resumeCursor: nextCursor };
}

/** Products in a category: Top this week (default), Trending or New. */
app.get("/categories/:slug/products", async (c) => {
  const cat = await c.get("db").select().from(categories).where(eq(categories.slug, c.req.param("slug"))).get();
  if (!cat) throw notFound("Category not found");
  return c.json(await rankedList(c, { categoryId: cat.id }));
});

/** Products across all categories (/top, /trending, /new): Top this week (default), Trending or New (the last NEW_PAGE_DAYS days). */
app.get("/products", async (c) => c.json(await rankedList(c, null, nowSec() - NEW_PAGE_DAYS * 86400)));

/** A category's weekly archive, e.g. /categories/design/weeks/2026-44 (404 in pre-launch and for weeks without one). */
app.get("/categories/:slug/weeks/:week", async (c) => {
  const db = c.get("db");
  const week = parseWeek(c.req.param("week"));
  if (!week || (await isPrelaunch(c.env, db))) throw notFound("Archive not found");
  const cat = await db.select({ id: categories.id, slug: categories.slug, name: categories.name }).from(categories).where(eq(categories.slug, c.req.param("slug"))).get();
  if (!cat) throw notFound("Category not found");
  const archive = await weekArchive(db, c.env, cat.id, week.index, nowSec());
  if (!archive) throw notFound("Archive not found");
  const body: WeekArchiveDTO = { category: { slug: cat.slug, name: cat.name }, week: { slug: week.slug, year: week.year, week: week.week }, ...archive };
  return c.json(body);
});

/** Available perks of live products for the public /perks page. Codes and redeem links stay on the product page, behind an account. */
app.get("/perks", async (c) => {
  const db = c.get("db");
  const rows = await db
    .select({ id: perks.id, title: perks.title, type: perks.type, expiresAt: perks.expiresAt, slug: products.slug, productTitle: products.title, imageKey: productImages.r2Key, width: productImages.width, height: productImages.height })
    .from(perks)
    .innerJoin(products, and(eq(products.id, perks.productId), live))
    .leftJoin(productImages, and(eq(productImages.productId, products.id), eq(productImages.sortOrder, 0)))
    .where(perkAvailableSql(nowSec()))
    .orderBy(desc(products.publishedAt), asc(perks.id))
    .limit(PERKS_PAGE_MAX)
    .all();
  const items: PublicPerkDTO[] = rows.map((r) => ({
    perkId: r.id,
    title: r.title,
    type: r.type,
    expiresAt: r.expiresAt,
    product: { slug: r.slug, title: r.productTitle, image: r.imageKey ? { key: r.imageKey, url: imageUrl(c.env, r.imageKey), width: r.width, height: r.height } : null },
  }));
  return c.json({ items });
});

/** Home page: the pre-launch state, Top this week (when there are enough), categories and the reserved count. */
app.get("/home", async (c) => {
  const db = c.get("db");
  const prelaunch = await isPrelaunch(c.env, db);
  const [top, cats, reserved] = await Promise.all([
    listProducts(db, c.env, { scope: null, sort: "top", filters: {}, limit: HOME_TOP_MIN }),
    categoryList(db, prelaunch),
    prelaunch
      ? db
          .select({ n: count() })
          .from(user)
          .where(and(isNotNull(user.onboardedAt), isNull(user.bannedAt)))
          .get()
      : null,
  ]);
  const reservedCount = reserved?.n ?? 0;
  const body: HomeDTO = {
    prelaunch,
    top: top.items.length >= HOME_TOP_MIN ? top.items : null,
    reservedCount: prelaunch && reservedCount >= RESERVED_COUNT_MIN ? reservedCount : null,
    categories: cats,
  };
  return c.json(body);
});

/** Personal feed: Top this week (default), Trending or New in the categories the user follows (everything without interests). */
app.get("/feed", async (c) => {
  const viewer = requireUser(c);
  const interest = await c.get("db").select({ id: userInterests.categoryId }).from(userInterests).where(eq(userInterests.userId, viewer.id)).limit(1).get();
  return c.json(await rankedList(c, interest ? { interestsOf: viewer.id } : null));
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
  const db = c.get("db");
  const detail = await loadDetail(db, c.env, { slug: c.req.param("slug") });
  if (detail) return c.json(detail);
  // Hidden (under review) or removed: 410 for the page, with a category to send visitors on to.
  const gone = await db.select({ id: products.id }).from(products).where(eq(products.slug, c.req.param("slug"))).get();
  if (!gone) throw notFound("Product not found");
  const category = await db
    .select({ slug: categories.slug, name: categories.name })
    .from(productCategories)
    .innerJoin(categories, eq(categories.id, productCategories.categoryId))
    .where(eq(productCategories.productId, gone.id))
    .orderBy(asc(categories.sortOrder))
    .get();
  throw new ApiError("GONE", "This product is no longer listed.", category ? { category } : {});
});

/** The product's 1200×630 Open Graph card, e.g. /og/products/ledgerly.png (docs/SEO.md). */
app.get("/og/products/:file", async (c) => {
  const m = c.req.param("file").match(/^(.+)\.png$/);
  if (!m) throw notFound("Not found");
  return productOgImage(c.env, c.get("db"), m[1]!);
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

/** Counts a click on the product link (batched); for signed-in viewers it is also a ranking signal. */
app.post("/products/:id/click", async (c) => {
  const product = await findLiveProduct(c.get("db"), c.req.param("id"));
  bump(product.id, "clicks");
  trackSignal(c, product, "click");
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

/**
 * One child sitemap's entries (docs/SEO.md): live products, listed categories, makers with at least
 * one live product and weekly category archives. All empty in pre-launch, when those pages redirect
 * to the waitlist.
 */
app.get("/sitemap/:kind", async (c) => {
  const db = c.get("db");
  if (await isPrelaunch(c.env, db)) return c.json({ items: [] });
  switch (c.req.param("kind")) {
    case "products": {
      const rows = await db.select({ slug: products.slug, updatedAt: products.updatedAt }).from(products).where(live).orderBy(desc(products.publishedAt)).limit(45000);
      return c.json({ items: rows.map((r) => ({ path: `/p/${r.slug}`, updatedAt: r.updatedAt })) });
    }
    case "categories": {
      const cats = await categoryList(db, false);
      return c.json({ items: cats.filter((x) => x.listed).map((x) => ({ path: `/c/${x.slug}` })) });
    }
    case "makers": {
      const rows = await db
        .select({ username: user.username, updatedAt: sql<number>`max(${products.updatedAt})` })
        .from(user)
        .innerJoin(products, and(eq(products.makerId, user.id), live))
        .where(isNotNull(user.username))
        .groupBy(user.id)
        .limit(45000);
      return c.json({ items: rows.map((r) => ({ path: `/m/${r.username}`, updatedAt: r.updatedAt })) });
    }
    case "weeks": {
      const weeks = await archivedWeeks(db, nowSec());
      return c.json({ items: weeks.map((w) => ({ path: `/c/${w.category}/week/${w.week}` })) });
    }
    default:
      throw notFound("Unknown sitemap");
  }
});

export default app;
