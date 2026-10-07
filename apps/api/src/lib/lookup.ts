import { eq, or } from "drizzle-orm";
import { products, type Database } from "@tm/db";
import type { SessionUser } from "../env";
import { ApiError, notFound } from "./errors";

export type ProductRow = typeof products.$inferSelect;

/** Finds a product by id or slug (routes accept either). */
export async function findProduct(db: Database, idOrSlug: string): Promise<ProductRow | null> {
  return (await db.select().from(products).where(or(eq(products.id, idOrSlug), eq(products.slug, idOrSlug))).get()) ?? null;
}

/** A product visitors may interact with: it exists and is live. */
export async function findLiveProduct(db: Database, idOrSlug: string): Promise<ProductRow> {
  const p = await findProduct(db, idOrSlug);
  if (!p || p.status !== "live") throw notFound("Product not found");
  return p;
}

export function canManage(user: SessionUser, product: ProductRow): boolean {
  return product.makerId === user.id || user.role === "admin";
}

/** A product the signed-in maker owns (admins may manage any product). */
export async function findOwnedProduct(db: Database, user: SessionUser, idOrSlug: string): Promise<ProductRow> {
  const p = await findProduct(db, idOrSlug);
  if (!p || (p.status === "removed" && user.role !== "admin")) throw notFound("Product not found");
  if (!canManage(user, p)) throw new ApiError("FORBIDDEN", "You can only manage your own products.");
  return p;
}
