import { and, count, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import {
  blockedDomains,
  categories,
  domains,
  notifications,
  perkClaims,
  perkCodes,
  perks,
  productImages,
  products,
  pushSubscriptions,
  saves,
  user,
  userInterests,
} from "@tm/db";
import {
  PAGE_SIZE,
  VERIFY_META_NAME,
  domainCandidates,
  decodeCursor,
  domainCreateSchema,
  domainVerifySchema,
  encodeCursor,
  interestsSchema,
  newId,
  nowSec,
  parseDomainInput,
  pushSubscriptionSchema,
  randomToken,
  settingsSchema,
  verificationInstructions,
  type ClaimedPerkDTO,
  type DomainDTO,
  type MeDTO,
  type NotificationDTO,
  type Page,
  type ProductCardDTO,
} from "@tm/shared";
import { z } from "zod";
import type { AppEnv, SessionUser } from "../env";
import { lookupTxt } from "../lib/dns";
import { ApiError, notFound } from "../lib/errors";
import { FetchError, safeFetch } from "../lib/fetcher";
import { extractMetadata } from "../lib/metadata";
import { imageUrl, loadCards } from "../lib/products";
import { RESERVED_USERNAMES } from "../lib/username";
import { body } from "../lib/validate";
import { findLiveProduct } from "../lib/lookup";
import { isMaker, requireUser, requireVerifiedUser } from "../middleware";

const app = new Hono<AppEnv>();

async function meDto(c: Context<AppEnv>, u: SessionUser): Promise<MeDTO> {
  const db = c.get("db");
  const [interests, unread] = await db.batch([
    db
      .select({ slug: categories.slug })
      .from(userInterests)
      .innerJoin(categories, eq(categories.id, userInterests.categoryId))
      .where(eq(userInterests.userId, u.id)),
    db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, u.id), isNull(notifications.readAt))),
  ]);
  return {
    id: u.id,
    email: u.email,
    emailVerified: u.emailVerified,
    name: u.name,
    image: u.image,
    username: u.username,
    bio: u.bio,
    role: u.role,
    digestFrequency: u.digestFrequency,
    onboarded: u.onboardedAt != null,
    isMaker: u.role === "admin" || (await isMaker(db, u.id)),
    interests: interests.map((i) => i.slug),
    unreadNotifications: unread[0]?.n ?? 0,
    createdAt: Math.floor(new Date(u.createdAt).getTime() / 1000),
  };
}

app.get("/me", async (c) => {
  const u = c.get("user");
  if (!u) throw new ApiError("UNAUTHORIZED", "Not signed in.");
  // Banned users still get their profile so the UI can explain the suspension.
  return c.json({ ...(await meDto(c, u)), banned: u.bannedAt != null });
});

/* Interests (onboarding) */

app.get("/me/interests", async (c) => {
  const u = requireUser(c);
  const rows = await c
    .get("db")
    .select({ slug: categories.slug })
    .from(userInterests)
    .innerJoin(categories, eq(categories.id, userInterests.categoryId))
    .where(eq(userInterests.userId, u.id))
    .all();
  return c.json({ categories: rows.map((r) => r.slug) });
});

app.put("/me/interests", async (c) => {
  const u = requireUser(c);
  const db = c.get("db");
  const input = await body(c, interestsSchema);
  const cats = await db.select({ id: categories.id, slug: categories.slug }).from(categories).where(inArray(categories.slug, input.categories)).all();
  if (cats.length !== new Set(input.categories).size) throw new ApiError("VALIDATION", "Unknown category.");
  await db.batch([
    db.delete(userInterests).where(eq(userInterests.userId, u.id)),
    db.insert(userInterests).values(cats.map((cat) => ({ userId: u.id, categoryId: cat.id }))),
    db
      .update(user)
      .set({ onboardedAt: sql`coalesce(${user.onboardedAt}, ${nowSec()})` })
      .where(eq(user.id, u.id)),
  ]);
  return c.json({ categories: cats.map((x) => x.slug) });
});

/* Settings */

app.get("/me/settings", async (c) => {
  const u = requireUser(c);
  return c.json({ name: u.name, username: u.username, bio: u.bio, digestFrequency: u.digestFrequency, email: u.email });
});

app.patch("/me/settings", async (c) => {
  const u = requireUser(c);
  const db = c.get("db");
  const input = await body(c, settingsSchema);
  if (input.username && input.username !== u.username) {
    if (RESERVED_USERNAMES.has(input.username)) throw new ApiError("USERNAME_TAKEN", "That username is reserved.");
    const taken = await db.select({ id: user.id }).from(user).where(and(eq(user.username, input.username), ne(user.id, u.id))).get();
    if (taken) throw new ApiError("USERNAME_TAKEN", "That username is taken.");
  }
  const patch: Partial<typeof user.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.username !== undefined) patch.username = input.username;
  if (input.bio !== undefined) patch.bio = input.bio || null;
  if (input.digestFrequency !== undefined) patch.digestFrequency = input.digestFrequency;
  await db.update(user).set(patch).where(eq(user.id, u.id));
  return c.json({ ok: true });
});

/* Saves */

app.get("/me/saves", async (c) => {
  const u = requireUser(c);
  const db = c.get("db");
  const cur = decodeCursor(c.req.query("cursor"));
  const rows = await db
    .select({ id: saves.productId, t: saves.createdAt })
    .from(saves)
    .where(and(eq(saves.userId, u.id), cur ? sql`(${saves.createdAt}, ${saves.productId}) < (${cur.time}, ${cur.id})` : undefined))
    .orderBy(desc(saves.createdAt), desc(saves.productId))
    .limit(PAGE_SIZE + 1);
  const more = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  return c.json({
    items: await loadCards(db, c.env, page.map((r) => r.id)),
    nextCursor: more && last ? encodeCursor(last.t, last.id) : null,
  } satisfies Page<ProductCardDTO>);
});

app.put("/me/saves/:productId", async (c) => {
  const u = requireUser(c);
  const db = c.get("db");
  const product = await findLiveProduct(db, c.req.param("productId"));
  const inserted = await db
    .insert(saves)
    .values({ userId: u.id, productId: product.id, createdAt: nowSec() })
    .onConflictDoNothing()
    .returning({ id: saves.productId });
  if (inserted.length) {
    await db
      .update(products)
      .set({ saveCount: sql`${products.saveCount} + 1` })
      .where(eq(products.id, product.id));
  }
  return c.json({ saved: true, saveCount: product.saveCount + inserted.length });
});

app.delete("/me/saves/:productId", async (c) => {
  const u = requireUser(c);
  const db = c.get("db");
  const id = c.req.param("productId");
  const removed = await db
    .delete(saves)
    .where(and(eq(saves.userId, u.id), eq(saves.productId, id)))
    .returning({ id: saves.productId });
  if (removed.length) {
    await db
      .update(products)
      .set({ saveCount: sql`max(${products.saveCount} - 1, 0)` })
      .where(eq(products.id, id));
  }
  return c.json({ saved: false });
});

/* Web push */

app.post("/me/push-subscriptions", async (c) => {
  const u = requireUser(c);
  const db = c.get("db");
  const input = await body(c, pushSubscriptionSchema);
  await db
    .insert(pushSubscriptions)
    .values({ id: newId(), userId: u.id, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth, createdAt: nowSec() })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: u.id, p256dh: input.keys.p256dh, auth: input.keys.auth } });
  return c.json({ ok: true }, 201);
});

app.delete("/me/push-subscriptions", async (c) => {
  const u = requireUser(c);
  const input = await body(c, z.object({ endpoint: z.string().max(2048) }));
  await c
    .get("db")
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, u.id), eq(pushSubscriptions.endpoint, input.endpoint)));
  return c.json({ ok: true });
});

app.get("/me/push-config", (c) => c.json({ publicKey: c.env.VAPID_PUBLIC_KEY || null }));

/* Notifications */

app.get("/me/notifications", async (c) => {
  const u = requireUser(c);
  const db = c.get("db");
  const cur = decodeCursor(c.req.query("cursor"));
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, u.id), cur ? sql`(${notifications.createdAt}, ${notifications.id}) < (${cur.time}, ${cur.id})` : undefined))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(PAGE_SIZE + 1);
  const more = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  const items: NotificationDTO[] = page.map((n) => ({ id: n.id, type: n.type, payload: JSON.parse(n.payload), readAt: n.readAt, createdAt: n.createdAt }));
  return c.json({ items, nextCursor: more && last ? encodeCursor(last.createdAt, last.id) : null } satisfies Page<NotificationDTO>);
});

app.post("/me/notifications/read", async (c) => {
  const u = requireUser(c);
  const input = await body(c, z.object({ ids: z.array(z.string().max(40)).max(50).optional() }));
  const where = and(eq(notifications.userId, u.id), isNull(notifications.readAt), input.ids?.length ? inArray(notifications.id, input.ids) : undefined);
  await c.get("db").update(notifications).set({ readAt: nowSec() }).where(where);
  return c.json({ ok: true });
});

/* Claimed perks */

app.get("/me/perks", async (c) => {
  const u = requireUser(c);
  const db = c.get("db");
  const rows = await db
    .select({ claim: perkClaims, perk: perks, code: perkCodes.code, product: { id: products.id, slug: products.slug, title: products.title } })
    .from(perkClaims)
    .innerJoin(perks, eq(perks.id, perkClaims.perkId))
    .innerJoin(products, eq(products.id, perks.productId))
    .leftJoin(perkCodes, eq(perkCodes.id, perkClaims.codeId))
    .where(eq(perkClaims.userId, u.id))
    .orderBy(desc(perkClaims.claimedAt))
    .limit(200)
    .all();
  const productIds = [...new Set(rows.map((r) => r.product.id))];
  const images = productIds.length
    ? await db
        .select({ productId: productImages.productId, key: productImages.r2Key, width: productImages.width, height: productImages.height })
        .from(productImages)
        .where(and(inArray(productImages.productId, productIds), eq(productImages.sortOrder, 0)))
        .all()
    : [];
  const img = new Map(images.map((i) => [i.productId, { key: i.key, url: imageUrl(c.env, i.key), width: i.width, height: i.height }]));
  const items: ClaimedPerkDTO[] = rows.map((r) => ({
    perkId: r.perk.id,
    title: r.perk.title,
    type: r.perk.type,
    code: r.code ?? r.perk.sharedCode,
    redeemUrl: r.perk.redeemUrl,
    claimedAt: r.claim.claimedAt,
    expiresAt: r.perk.expiresAt,
    product: { slug: r.product.slug, title: r.product.title, image: img.get(r.product.id) ?? null },
  }));
  return c.json({ items });
});

/* Domains */

function domainDto(d: typeof domains.$inferSelect): DomainDTO {
  return { id: d.id, hostname: d.hostname, token: d.token, method: d.method, verifiedAt: d.verifiedAt, createdAt: d.createdAt, ...verificationInstructions(d.hostname, d.token) };
}

app.get("/me/domains", async (c) => {
  const u = requireUser(c);
  const rows = await c.get("db").select().from(domains).where(eq(domains.userId, u.id)).orderBy(desc(domains.createdAt)).all();
  return c.json({ items: rows.map(domainDto) });
});

app.post("/me/domains", async (c) => {
  const u = requireVerifiedUser(c);
  const db = c.get("db");
  const input = await body(c, domainCreateSchema);
  const hostname = parseDomainInput(input.domain);
  if (!hostname) throw new ApiError("INVALID_URL", "Enter a domain like myapp.com.");
  const blocked = await db.select().from(blockedDomains).where(inArray(blockedDomains.hostname, domainCandidates(hostname))).get();
  if (blocked) throw new ApiError("BLOCKED_DOMAIN", "This domain can't be listed.");

  const existing = await db.select().from(domains).where(eq(domains.hostname, hostname)).get();
  if (existing?.userId === u.id) return c.json(domainDto(existing));
  if (existing?.verifiedAt) throw new ApiError("DOMAIN_TAKEN", "This domain is already verified by another account.");

  const pending = await db
    .select({ n: count() })
    .from(domains)
    .where(and(eq(domains.userId, u.id), isNull(domains.verifiedAt)))
    .get();
  if ((pending?.n ?? 0) >= 10) throw new ApiError("LIMIT_REACHED", "Verify or remove some pending domains first.");

  const row = { id: newId(), userId: u.id, hostname, token: `tm-verify-${randomToken(16)}`, method: null, verifiedAt: null, createdAt: nowSec() };
  if (existing) {
    // An unverified claim never blocks the domain: whoever proves control first gets it.
    await db.update(domains).set({ userId: u.id, token: row.token, createdAt: row.createdAt }).where(eq(domains.id, existing.id));
    return c.json(domainDto({ ...existing, userId: u.id, token: row.token, createdAt: row.createdAt }), 201);
  }
  await db.insert(domains).values(row);
  return c.json(domainDto(row), 201);
});

app.delete("/me/domains/:id", async (c) => {
  const u = requireUser(c);
  const db = c.get("db");
  const d = await db
    .select()
    .from(domains)
    .where(and(eq(domains.id, c.req.param("id")), eq(domains.userId, u.id)))
    .get();
  if (!d) throw notFound("Domain not found");
  const used = await db.select({ id: products.id }).from(products).where(eq(products.domainId, d.id)).limit(1).get();
  if (used) throw new ApiError("FORBIDDEN", "This domain has products. Delete them first.");
  await db.delete(domains).where(eq(domains.id, d.id));
  return c.json({ ok: true });
});

async function checkMetaTag(hostname: string, token: string): Promise<boolean> {
  for (const url of [`https://${hostname}/`, `https://www.${hostname}/`]) {
    try {
      const res = await safeFetch(url, { accept: "text/html" });
      if (res.status >= 400) continue;
      const meta = extractMetadata(new TextDecoder().decode(res.body), res.url).meta;
      if (meta.get(VERIFY_META_NAME)?.trim() === token) return true;
    } catch (err) {
      if (!(err instanceof FetchError)) throw err;
    }
  }
  return false;
}

app.post("/me/domains/:id/verify", async (c) => {
  const u = requireVerifiedUser(c);
  const db = c.get("db");
  const input = await body(c, domainVerifySchema);
  const d = await db
    .select()
    .from(domains)
    .where(and(eq(domains.id, c.req.param("id")), eq(domains.userId, u.id)))
    .get();
  if (!d) throw notFound("Domain not found");
  if (d.verifiedAt) return c.json(domainDto(d));

  let ok = false;
  if (input.method === "dns") {
    const { dnsName } = verificationInstructions(d.hostname, d.token);
    try {
      ok = (await lookupTxt(dnsName)).some((v) => v.trim() === d.token);
    } catch {
      throw new ApiError("VERIFICATION_FAILED", "DNS lookup failed. Try again in a minute.");
    }
    if (!ok) throw new ApiError("VERIFICATION_FAILED", `No TXT record with the token was found at ${dnsName}. DNS changes can take a few minutes.`);
  } else {
    ok = await checkMetaTag(d.hostname, d.token);
    if (!ok) throw new ApiError("VERIFICATION_FAILED", `The meta tag was not found on https://${d.hostname}/.`);
  }
  const verifiedAt = nowSec();
  await db.update(domains).set({ verifiedAt, method: input.method }).where(and(eq(domains.id, d.id), isNull(domains.verifiedAt)));
  return c.json(domainDto({ ...d, verifiedAt, method: input.method }));
});

app.get("/me/maker-status", async (c) => {
  const u = requireUser(c);
  const verified = await c
    .get("db")
    .select({ hostname: domains.hostname })
    .from(domains)
    .where(and(eq(domains.userId, u.id), isNotNull(domains.verifiedAt)))
    .all();
  return c.json({ isMaker: verified.length > 0 || u.role === "admin", domains: verified.map((d) => d.hostname) });
});

export default app;
