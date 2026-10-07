import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import {
  blockedDomains,
  categories,
  domains,
  feedback,
  perkCodes,
  perks,
  productCategories,
  productImages,
  products,
  roadmapItems,
} from "@tm/db";
import {
  DEFAULT_LIMITS,
  TAGLINE_MAX,
  domainCandidates,
  hostBelongsToDomain,
  markdownToText,
  newId,
  normalizeUrl,
  nowSec,
  perksPutSchema,
  productCreateSchema,
  productPreviewSchema,
  productUpdateSchema,
  slugify,
  type MakerProductDTO,
  type MakerProductDetailDTO,
  type PerkMakerDTO,
  type PreviewImageDTO,
  type ProductPreviewDTO,
  type StatsDTO,
} from "@tm/shared";
import type { AppEnv, SessionUser } from "../env";
import { productPaths, purgeWebPaths } from "../lib/cache";
import { ApiError, notFound } from "../lib/errors";
import { FetchError, safeFetch } from "../lib/fetcher";
import { headImage, storeImage, type StoredImage } from "../lib/images";
import { findOwnedProduct } from "../lib/lookup";
import { extractMetadata, splitTitle } from "../lib/metadata";
import { imageUrl, loadCards, loadDetail } from "../lib/products";
import { takeScreenshot } from "../lib/screenshot";
import { requireTurnstile } from "../lib/turnstile";
import { body } from "../lib/validate";
import { clientIp, requireMaker } from "../middleware";

const app = new Hono<AppEnv>();
const DAY = 86400;

type Db = AppEnv["Variables"]["db"];

/** Normalizes the link and runs every publish check that doesn't need the page itself. */
async function checkLink(db: Db, u: SessionUser, rawUrl: string, opts: { excludeProductId?: string } = {}) {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) throw new ApiError("INVALID_URL", "Paste a full link to your product, like https://myapp.com.");
  const host = new URL(normalized).hostname;

  const blocked = await db.select().from(blockedDomains).where(inArray(blockedDomains.hostname, domainCandidates(host))).get();
  if (blocked) throw new ApiError("BLOCKED_DOMAIN", "Links to this domain can't be listed.");

  const owned = await db
    .select()
    .from(domains)
    .where(and(eq(domains.userId, u.id), isNotNull(domains.verifiedAt), inArray(domains.hostname, domainCandidates(host))))
    .all();
  // The most specific verified domain wins (app.myapp.com over myapp.com).
  const domain = owned.filter((d) => hostBelongsToDomain(host, d.hostname)).sort((a, b) => b.hostname.length - a.hostname.length)[0];
  if (!domain) throw new ApiError("DOMAIN_NOT_VERIFIED", `Verify ${host} (or its parent domain) before publishing this link.`);

  const dup = await db.select({ id: products.id, slug: products.slug, status: products.status }).from(products).where(eq(products.urlNormalized, normalized)).get();
  if (dup && dup.id !== opts.excludeProductId) {
    throw new ApiError("DUPLICATE_URL", "This product is already listed.", dup.status === "live" ? { existing: `/p/${dup.slug}` } : {});
  }
  return { normalized, host, domain };
}

async function checkPostingLimits(c: Context<AppEnv>, makerId: string) {
  if (c.get("user")?.role === "admin") return;
  const db = c.get("db");
  const limits = c.get("limits");
  const now = nowSec();
  const [day, week] = await db.batch([
    db
      .select({ n: count() })
      .from(products)
      .where(and(eq(products.makerId, makerId), gt(products.publishedAt, now - DAY))),
    db
      .select({ n: count() })
      .from(products)
      .where(and(eq(products.makerId, makerId), gt(products.publishedAt, now - 7 * DAY))),
  ]);
  if ((day[0]?.n ?? 0) >= limits.PRODUCTS_PER_DAY) throw new ApiError("LIMIT_REACHED", `You can publish ${limits.PRODUCTS_PER_DAY} products per day. Try again tomorrow.`);
  if ((week[0]?.n ?? 0) >= limits.PRODUCTS_PER_WEEK) throw new ApiError("LIMIT_REACHED", `You can publish ${limits.PRODUCTS_PER_WEEK} products per week.`);
}

function taglineFrom(candidate: string | null, description: string | null): string {
  const src = (candidate ?? description ?? "").replace(/\s+/g, " ").trim();
  if (src.length <= TAGLINE_MAX) return src;
  const cut = src.slice(0, TAGLINE_MAX - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 30)).trimEnd()}…`;
}

/**
 * Step 1 of publishing: the maker pastes a link. We normalize it, check domain ownership and
 * duplicates, read the page's metadata and store a preview image (og:image, or a screenshot).
 */
app.post("/maker/products/preview", async (c) => {
  const u = await requireMaker(c);
  const db = c.get("db");
  const input = await body(c, productPreviewSchema);
  await requireTurnstile(c.env, input.turnstileToken, clientIp(c));
  const { normalized, host } = await checkLink(db, u, input.url);
  await checkPostingLimits(c, u.id);

  let page;
  try {
    page = await safeFetch(normalized, { accept: "text/html,application/xhtml+xml" });
  } catch (err) {
    if (err instanceof FetchError) throw new ApiError("FETCH_FAILED", `We couldn't open your page: ${err.message}`);
    throw err;
  }
  if (page.status >= 400) throw new ApiError("FETCH_FAILED", `Your page answered with HTTP ${page.status}.`);
  const meta = extractMetadata(new TextDecoder().decode(page.body), page.url);

  const images: PreviewImageDTO[] = [];
  const keep = (img: StoredImage, source: PreviewImageDTO["source"]) =>
    images.push({ key: img.key, url: imageUrl(c.env, img.key), width: img.width, height: img.height, source });

  if (meta.image) {
    try {
      const res = await safeFetch(meta.image, { maxBytes: DEFAULT_LIMITS.IMAGE_MAX_BYTES, accept: "image/*" });
      if (res.status < 400) keep(await storeImage(c.env, res.body, { source: "og", allowGif: true, ownerId: u.id }), "og");
    } catch (err) {
      console.warn("[preview] og:image failed", err instanceof Error ? err.message : err);
    }
  }
  if (images.length === 0) {
    const shot = await takeScreenshot(c.env, normalized);
    if (shot) {
      try {
        keep(await storeImage(c.env, shot, { source: "screenshot", ownerId: u.id }), "screenshot");
      } catch (err) {
        console.warn("[preview] screenshot store failed", err);
      }
    }
  }

  const { name, tagline } = splitTitle(meta.title ?? host, meta.siteName);
  const preview: ProductPreviewDTO = {
    url: input.url,
    normalizedUrl: normalized,
    hostname: host,
    title: name.slice(0, 80),
    tagline: taglineFrom(tagline, meta.description),
    description: meta.description ?? "",
    images,
  };
  return c.json(preview);
});

async function resolveCategories(db: Db, slugs: string[]) {
  const unique = [...new Set(slugs)];
  const rows = await db.select({ id: categories.id, slug: categories.slug }).from(categories).where(inArray(categories.slug, unique)).all();
  if (rows.length !== unique.length) throw new ApiError("VALIDATION", "Unknown category.");
  return unique.map((s) => rows.find((r) => r.slug === s)!);
}

async function resolveImages(c: Context<AppEnv>, keys: string[]) {
  const unique = [...new Set(keys)].slice(0, c.get("limits").IMAGES_PER_PRODUCT);
  const out: { key: string; width: number | null; height: number | null; source: "og" | "screenshot" | "upload" }[] = [];
  for (const key of unique) {
    const head = await headImage(c.env, key);
    if (!head) throw new ApiError("VALIDATION", "An image could not be found. Upload it again.");
    const source = head.source === "og" || head.source === "screenshot" ? head.source : "upload";
    out.push({ key, width: head.width, height: head.height, source });
  }
  return out;
}

async function uniqueSlug(db: Db, title: string, excludeId?: string): Promise<string> {
  const base = slugify(title);
  const rows = await db
    .select({ slug: products.slug, id: products.id })
    .from(products)
    .where(or(eq(products.slug, base), like(products.slug, `${base}-%`)))
    .all();
  const taken = new Set(rows.filter((r) => r.id !== excludeId).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${newId().slice(-6)}`;
}

/** Step 2: publish. The product goes live immediately and appears in matching feeds. */
app.post("/maker/products", async (c) => {
  const u = await requireMaker(c);
  const db = c.get("db");
  const input = await body(c, productCreateSchema);
  const { normalized, domain } = await checkLink(db, u, input.url);
  await checkPostingLimits(c, u.id);
  const cats = await resolveCategories(db, input.categories);
  const imgs = await resolveImages(c, input.images.map((i) => i.key));

  const now = nowSec();
  const id = newId();
  const slug = await uniqueSlug(db, input.title);
  const row: typeof products.$inferInsert = {
    id,
    makerId: u.id,
    domainId: domain.id,
    slug,
    url: normalized,
    urlNormalized: normalized,
    title: input.title,
    tagline: input.tagline,
    description: input.description,
    stage: input.stage,
    pricing: input.pricing,
    feedbackMode: input.feedbackMode,
    roadmapEnabled: input.roadmapEnabled,
    status: "live",
    publishedAt: now,
    updatedAt: now,
  };
  try {
    await db.batch([
      db.insert(products).values(row),
      db.insert(productCategories).values(cats.map((cat) => ({ productId: id, categoryId: cat.id, publishedAt: now }))),
      ...imgs.map((img, i) => db.insert(productImages).values({ id: newId(), productId: id, r2Key: img.key, width: img.width, height: img.height, source: img.source, sortOrder: i })),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE") && String(err).includes("url_normalized")) {
      throw new ApiError("DUPLICATE_URL", "This product is already listed.");
    }
    throw err;
  }
  c.executionCtx.waitUntil(purgeWebPaths(c.env, ["/", ...cats.map((x) => `/c/${x.slug}`)]));
  return c.json({ id, slug }, 201);
});

app.get("/maker/products", async (c) => {
  const u = await requireMaker(c);
  const db = c.get("db");
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.makerId, u.id), sql`${products.status} != 'removed'`))
    .orderBy(desc(products.publishedAt))
    .all();
  const cards = await loadCards(db, c.env, rows.map((r) => r.id), { includeHidden: true });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items: MakerProductDTO[] = cards.map((card) => {
    const r = byId.get(card.id)!;
    return { ...card, status: r.status, viewCount: r.viewCount, clickCount: r.clickCount, validReportCount: r.validReportCount };
  });
  return c.json({ items });
});

async function makerPerks(db: Db, productId: string): Promise<PerkMakerDTO[]> {
  const [rows, codes] = await db.batch([
    db.select().from(perks).where(eq(perks.productId, productId)).orderBy(asc(perks.id)),
    db
      .select({ perkId: perkCodes.perkId, total: count(), left: sql<number>`sum(case when ${perkCodes.claimedAt} is null then 1 else 0 end)` })
      .from(perkCodes)
      .innerJoin(perks, eq(perks.id, perkCodes.perkId))
      .where(eq(perks.productId, productId))
      .groupBy(perkCodes.perkId),
  ]);
  const codeStats = new Map(codes.map((c) => [c.perkId, c]));
  return rows.map((p) => ({
    id: p.id,
    type: p.type,
    title: p.title,
    details: p.details,
    sharedCode: p.sharedCode,
    redeemUrl: p.redeemUrl,
    maxClaims: p.maxClaims,
    claimCount: p.claimCount,
    expiresAt: p.expiresAt,
    active: p.active,
    codesTotal: codeStats.get(p.id)?.total ?? 0,
    codesLeft: Number(codeStats.get(p.id)?.left ?? 0),
  }));
}

app.get("/maker/products/:id", async (c) => {
  const u = await requireMaker(c);
  const db = c.get("db");
  const p = await findOwnedProduct(db, u, c.req.param("id"));
  const detail = await loadDetail(db, c.env, { id: p.id }, { includeHidden: true });
  if (!detail) throw notFound();
  const out: MakerProductDetailDTO = { ...detail, viewCount: p.viewCount, clickCount: p.clickCount, perksFull: await makerPerks(db, p.id) };
  return c.json(out);
});

app.patch("/maker/products/:id", async (c) => {
  const u = await requireMaker(c);
  const db = c.get("db");
  const p = await findOwnedProduct(db, u, c.req.param("id"));
  const input = await body(c, productUpdateSchema);
  const now = nowSec();
  const patch: Partial<typeof products.$inferInsert> = { updatedAt: now };
  if (input.title !== undefined) patch.title = input.title;
  if (input.tagline !== undefined) patch.tagline = input.tagline;
  if (input.description !== undefined) patch.description = input.description;
  if (input.stage !== undefined) patch.stage = input.stage;
  if (input.pricing !== undefined) patch.pricing = input.pricing;
  if (input.feedbackMode !== undefined) patch.feedbackMode = input.feedbackMode;
  if (input.roadmapEnabled !== undefined) patch.roadmapEnabled = input.roadmapEnabled;

  const oldCats = await db
    .select({ slug: categories.slug })
    .from(productCategories)
    .innerJoin(categories, eq(categories.id, productCategories.categoryId))
    .where(eq(productCategories.productId, p.id))
    .all();
  const statements = [];
  statements.push(db.update(products).set(patch).where(eq(products.id, p.id)));
  let newCats: { id: string; slug: string }[] = [];
  if (input.categories) {
    newCats = await resolveCategories(db, input.categories);
    statements.push(db.delete(productCategories).where(eq(productCategories.productId, p.id)));
    statements.push(db.insert(productCategories).values(newCats.map((cat) => ({ productId: p.id, categoryId: cat.id, publishedAt: p.publishedAt }))));
  }
  if (input.images) {
    const imgs = await resolveImages(c, input.images.map((i) => i.key));
    statements.push(db.delete(productImages).where(eq(productImages.productId, p.id)));
    imgs.forEach((img, i) =>
      statements.push(db.insert(productImages).values({ id: newId(), productId: p.id, r2Key: img.key, width: img.width, height: img.height, source: img.source, sortOrder: i })),
    );
  }
  await db.batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]]);
  c.executionCtx.waitUntil(purgeWebPaths(c.env, productPaths(p.slug, [...oldCats.map((x) => x.slug), ...newCats.map((x) => x.slug)])));
  return c.json({ ok: true, slug: p.slug });
});

app.delete("/maker/products/:id", async (c) => {
  const u = await requireMaker(c);
  const db = c.get("db");
  const p = await findOwnedProduct(db, u, c.req.param("id"));
  if (p.status === "hidden" && u.role !== "admin") {
    // Keep hidden products for the review queue; deleting would dodge moderation.
    throw new ApiError("FORBIDDEN", "This product is under review and can't be deleted right now.");
  }
  const cats = await db
    .select({ slug: categories.slug })
    .from(productCategories)
    .innerJoin(categories, eq(categories.id, productCategories.categoryId))
    .where(eq(productCategories.productId, p.id))
    .all();
  await db.delete(products).where(eq(products.id, p.id));
  c.executionCtx.waitUntil(purgeWebPaths(c.env, productPaths(p.slug, cats.map((x) => x.slug))));
  return c.json({ ok: true });
});

async function readUpload(c: Context<AppEnv>): Promise<Uint8Array> {
  const max = c.get("limits").IMAGE_MAX_BYTES;
  const declared = Number(c.req.header("content-length") ?? "0");
  if (declared > max + 64 * 1024) throw new ApiError("VALIDATION", "Images can be up to 5 MB.");
  const type = c.req.header("content-type") ?? "";
  let bytes: Uint8Array;
  if (type.startsWith("multipart/form-data")) {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") throw new ApiError("VALIDATION", "Attach an image file.");
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    bytes = new Uint8Array(await c.req.arrayBuffer());
  }
  if (bytes.byteLength === 0) throw new ApiError("VALIDATION", "The file is empty.");
  if (bytes.byteLength > max) throw new ApiError("VALIDATION", "Images can be up to 5 MB.");
  return bytes;
}

async function storeUpload(c: Context<AppEnv>, u: SessionUser): Promise<StoredImage> {
  const bytes = await readUpload(c);
  try {
    return await storeImage(c.env, bytes, { source: "upload", ownerId: u.id });
  } catch (err) {
    throw new ApiError("VALIDATION", err instanceof Error ? err.message : "Invalid image.");
  }
}

/** Upload an image before the product exists (publish form). Returns a key to send with the product. */
app.post("/maker/uploads", async (c) => {
  const u = await requireMaker(c);
  const img = await storeUpload(c, u);
  return c.json({ key: img.key, url: imageUrl(c.env, img.key), width: img.width, height: img.height, source: "upload" } satisfies PreviewImageDTO, 201);
});

/** Upload an image straight into an existing product (appended last). */
app.post("/maker/products/:id/images", async (c) => {
  const u = await requireMaker(c);
  const db = c.get("db");
  const p = await findOwnedProduct(db, u, c.req.param("id"));
  const existing = await db.select({ n: count(), max: sql<number>`coalesce(max(${productImages.sortOrder}), -1)` }).from(productImages).where(eq(productImages.productId, p.id)).get();
  if ((existing?.n ?? 0) >= c.get("limits").IMAGES_PER_PRODUCT) throw new ApiError("LIMIT_REACHED", "A product can have up to 6 images.");
  const img = await storeUpload(c, u);
  const id = newId();
  await db.insert(productImages).values({ id, productId: p.id, r2Key: img.key, width: img.width, height: img.height, source: "upload", sortOrder: (existing?.max ?? -1) + 1 });
  await db.update(products).set({ updatedAt: nowSec() }).where(eq(products.id, p.id));
  c.executionCtx.waitUntil(purgeWebPaths(c.env, productPaths(p.slug)));
  return c.json({ id, key: img.key, url: imageUrl(c.env, img.key), width: img.width, height: img.height }, 201);
});

/** Replaces the product's perks. Perks with an id are updated, missing ones deleted, new ones created. */
app.put("/maker/products/:id/perks", async (c) => {
  const u = await requireMaker(c);
  const db = c.get("db");
  const p = await findOwnedProduct(db, u, c.req.param("id"));
  const input = await body(c, perksPutSchema);
  const current = await db.select().from(perks).where(eq(perks.productId, p.id)).all();
  const currentIds = new Set(current.map((x) => x.id));
  const keepIds = new Set(input.perks.map((x) => x.id).filter((x): x is string => !!x && currentIds.has(x)));

  const statements = [];
  for (const old of current) if (!keepIds.has(old.id)) statements.push(db.delete(perks).where(eq(perks.id, old.id)));

  for (const perk of input.perks) {
    const values = {
      type: perk.type,
      title: perk.title,
      details: perk.details ?? null,
      sharedCode: perk.type === "coupon" || perk.type === "discount" ? (perk.sharedCode ?? null) : null,
      redeemUrl: perk.redeemUrl ?? null,
      maxClaims: perk.maxClaims ?? null,
      expiresAt: perk.expiresAt ?? null,
      active: perk.active,
    };
    const id = perk.id && keepIds.has(perk.id) ? perk.id : newId();
    if (perk.id && keepIds.has(perk.id)) statements.push(db.update(perks).set(values).where(eq(perks.id, id)));
    else statements.push(db.insert(perks).values({ id, productId: p.id, ...values }));

    if (perk.type === "unique_codes" && perk.codes?.length) {
      const codes = [...new Set(perk.codes)];
      for (let i = 0; i < codes.length; i += 20) {
        statements.push(
          db
            .insert(perkCodes)
            .values(codes.slice(i, i + 20).map((code) => ({ id: newId(), perkId: id, code })))
            .onConflictDoNothing(),
        );
      }
    }
  }
  if (statements.length) {
    for (let i = 0; i < statements.length; i += 100) {
      const chunk = statements.slice(i, i + 100);
      await db.batch(chunk as [(typeof chunk)[number], ...(typeof chunk)[number][]]);
    }
  }
  await db.update(products).set({ updatedAt: nowSec() }).where(eq(products.id, p.id));
  c.executionCtx.waitUntil(purgeWebPaths(c.env, productPaths(p.slug)));
  return c.json({ items: await makerPerks(db, p.id) });
});

app.get("/maker/products/:id/stats", async (c) => {
  const u = await requireMaker(c);
  const db = c.get("db");
  const p = await findOwnedProduct(db, u, c.req.param("id"));
  const [claims, fb, votes, open] = await db.batch([
    db.select({ n: sql<number>`coalesce(sum(${perks.claimCount}), 0)` }).from(perks).where(eq(perks.productId, p.id)),
    db.select({ n: count() }).from(feedback).where(eq(feedback.productId, p.id)),
    db.select({ n: sql<number>`coalesce(sum(${roadmapItems.voteCount}), 0)` }).from(roadmapItems).where(eq(roadmapItems.productId, p.id)),
    db
      .select({ n: count() })
      .from(feedback)
      .where(and(eq(feedback.productId, p.id), isNull(feedback.resolvedAt))),
  ]);
  const stats: StatsDTO & { openFeedback: number } = {
    views: p.viewCount,
    clicks: p.clickCount,
    saves: p.saveCount,
    perkClaims: Number(claims[0]?.n ?? 0),
    feedback: fb[0]?.n ?? 0,
    roadmapVotes: Number(votes[0]?.n ?? 0),
    openFeedback: open[0]?.n ?? 0,
  };
  return c.json(stats);
});

/** Plain-text helper for clients that want an excerpt. */
export const excerpt = markdownToText;

export default app;
