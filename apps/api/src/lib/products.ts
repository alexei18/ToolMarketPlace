import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import {
  categories,
  domains,
  perkClaims,
  perkCodes,
  perks,
  productCategories,
  productImages,
  products,
  user,
  type Database,
} from "@tm/db";
import {
  nowSec,
  renderLimitedMarkdown,
  type CategoryRef,
  type ImageDTO,
  type PerkPublicDTO,
  type ProductCardDTO,
  type ProductDetailDTO,
} from "@tm/shared";
import type { Env } from "../env";

/** Public URL of an R2 image key (`img/<hash>.webp`): the img. domain in production, else this worker. */
export function imageUrl(env: Env, key: string): string {
  const base = (env.IMAGES_BASE_URL || env.API_ORIGIN).replace(/\/$/, "");
  return `${base}/${key}`;
}

type ProductRow = typeof products.$inferSelect;
type MakerRow = { id: string; username: string | null; name: string; image: string | null };

/** SQL condition: a perk that can still be claimed. */
export function perkAvailableSql(now: number) {
  return and(
    eq(perks.active, true),
    or(isNull(perks.expiresAt), gt(perks.expiresAt, now)),
    or(isNull(perks.maxClaims), sql`${perks.claimCount} < ${perks.maxClaims}`),
  );
}

function toCard(env: Env, p: ProductRow, maker: MakerRow, image: ImageDTO | null, cats: CategoryRef[], hasPerk: boolean): ProductCardDTO {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    tagline: p.tagline,
    url: p.url,
    image,
    stage: p.stage,
    pricing: p.pricing,
    categories: cats,
    publishedAt: p.publishedAt,
    hasPerk,
    feedbackMode: p.feedbackMode,
    roadmapEnabled: p.roadmapEnabled,
    saveCount: p.saveCount,
    maker: { id: maker.id, username: maker.username, name: maker.name, image: maker.image },
  };
}

/** Loads product cards for the given ids, keeping their order. Hidden/removed products are dropped unless `includeHidden`. */
export async function loadCards(db: Database, env: Env, ids: string[], opts: { includeHidden?: boolean } = {}): Promise<ProductCardDTO[]> {
  if (ids.length === 0) return [];
  const now = nowSec();
  const [rows, images, cats, perkRows] = await db.batch([
    // D1 batch results come back as objects keyed by column name, so joined columns must have
    // unique names (products.id vs user.id) or drizzle maps them to the wrong fields.
    db
      .select({ p: products, maker: { id: sql<string>`${user.id}`.as("maker_user_id"), username: user.username, name: user.name, image: user.image } })
      .from(products)
      .innerJoin(user, eq(user.id, products.makerId))
      .where(inArray(products.id, ids)),
    db
      .select({ productId: productImages.productId, key: productImages.r2Key, width: productImages.width, height: productImages.height, id: productImages.id })
      .from(productImages)
      .where(inArray(productImages.productId, ids))
      .orderBy(asc(productImages.sortOrder)),
    db
      .select({ productId: productCategories.productId, slug: categories.slug, name: categories.name })
      .from(productCategories)
      .innerJoin(categories, eq(categories.id, productCategories.categoryId))
      .where(inArray(productCategories.productId, ids))
      .orderBy(asc(categories.sortOrder)),
    db
      .selectDistinct({ productId: perks.productId })
      .from(perks)
      .where(and(inArray(perks.productId, ids), perkAvailableSql(now))),
  ]);

  const firstImage = new Map<string, ImageDTO>();
  for (const img of images) {
    if (!firstImage.has(img.productId)) {
      firstImage.set(img.productId, { id: img.id, key: img.key, url: imageUrl(env, img.key), width: img.width, height: img.height });
    }
  }
  const catMap = new Map<string, CategoryRef[]>();
  for (const c of cats) {
    const list = catMap.get(c.productId) ?? [];
    list.push({ slug: c.slug, name: c.name });
    catMap.set(c.productId, list);
  }
  const withPerk = new Set(perkRows.map((r) => r.productId));
  const byId = new Map(rows.map((r) => [r.p.id, r]));

  const out: ProductCardDTO[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;
    if (!opts.includeHidden && r.p.status !== "live") continue;
    out.push(toCard(env, r.p, r.maker, firstImage.get(id) ?? null, catMap.get(id) ?? [], withPerk.has(id)));
  }
  return out;
}

export function toPublicPerk(p: typeof perks.$inferSelect, now: number): PerkPublicDTO {
  const remaining = p.maxClaims == null ? null : Math.max(0, p.maxClaims - p.claimCount);
  const expired = p.expiresAt != null && p.expiresAt <= now;
  return {
    id: p.id,
    type: p.type,
    title: p.title,
    details: p.details,
    expiresAt: p.expiresAt,
    remaining,
    available: p.active && !expired && remaining !== 0,
  };
}

/** Full product page data. Codes and redeem links are never included here (see viewerPerks). */
export async function loadDetail(
  db: Database,
  env: Env,
  where: { slug: string } | { id: string },
  opts: { includeHidden?: boolean } = {},
): Promise<ProductDetailDTO | null> {
  const cond = "slug" in where ? eq(products.slug, where.slug) : eq(products.id, where.id);
  const row = await db
    .select({ p: products, maker: { id: user.id, username: user.username, name: user.name, image: user.image } })
    .from(products)
    .innerJoin(user, eq(user.id, products.makerId))
    .where(cond)
    .get();
  if (!row) return null;
  if (!opts.includeHidden && row.p.status !== "live") return null;
  const id = row.p.id;
  const now = nowSec();
  const [images, cats, perkRows, domainRow] = await db.batch([
    db.select().from(productImages).where(eq(productImages.productId, id)).orderBy(asc(productImages.sortOrder)),
    db
      .select({ slug: categories.slug, name: categories.name })
      .from(productCategories)
      .innerJoin(categories, eq(categories.id, productCategories.categoryId))
      .where(eq(productCategories.productId, id))
      .orderBy(asc(categories.sortOrder)),
    db.select().from(perks).where(eq(perks.productId, id)).orderBy(asc(perks.id)),
    db.select({ hostname: domains.hostname }).from(domains).where(eq(domains.id, row.p.domainId)),
  ]);
  const imgs: ImageDTO[] = images.map((i) => ({ id: i.id, key: i.r2Key, url: imageUrl(env, i.r2Key), width: i.width, height: i.height }));
  const publicPerks = perkRows.filter((p) => p.active).map((p) => toPublicPerk(p, now));
  const card = toCard(env, row.p, row.maker, imgs[0] ?? null, cats, publicPerks.some((p) => p.available));
  return {
    ...card,
    description: row.p.description,
    descriptionHtml: renderLimitedMarkdown(row.p.description),
    images: imgs,
    perks: publicPerks,
    hostname: domainRow[0]?.hostname ?? new URL(row.p.url).hostname,
    status: row.p.status,
    updatedAt: row.p.updatedAt,
  };
}

/** Perks of a product as seen by a signed-in user, with codes for the ones they claimed. */
export async function viewerPerks(db: Database, productId: string, userId: string): Promise<PerkPublicDTO[]> {
  const now = nowSec();
  const rows = await db
    .select({ perk: perks, claimedAt: perkClaims.claimedAt, code: perkCodes.code })
    .from(perks)
    .leftJoin(perkClaims, and(eq(perkClaims.perkId, perks.id), eq(perkClaims.userId, userId)))
    .leftJoin(perkCodes, eq(perkCodes.id, perkClaims.codeId))
    .where(eq(perks.productId, productId))
    .orderBy(asc(perks.id))
    .all();
  return rows
    .filter((r) => r.perk.active || r.claimedAt != null)
    .map((r) => {
      const base = toPublicPerk(r.perk, now);
      if (r.claimedAt == null) return { ...base, claimed: false };
      return { ...base, claimed: true, code: r.code ?? r.perk.sharedCode, redeemUrl: r.perk.redeemUrl };
    });
}
