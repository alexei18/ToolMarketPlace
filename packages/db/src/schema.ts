import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type {
  DigestFrequency,
  DomainMethod,
  FeedbackMode,
  FeedbackType,
  NotificationType,
  PerkType,
  Pricing,
  ProductStatus,
  ReportReason,
  RoadmapStatus,
  Stage,
} from "@tm/shared";

/*
 * Better Auth tables (user, session, account, verification). Dates are Unix seconds,
 * like the rest of the schema; Better Auth reads and writes them as Date objects.
 */

export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    image: text("image"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    // Fields added by the app
    username: text("username").unique(),
    bio: text("bio"),
    role: text("role").$type<"user" | "admin">().notNull().default("user"),
    bannedAt: integer("banned_at"),
    digestFrequency: text("digest_frequency").$type<DigestFrequency>().notNull().default("weekly"),
    lastDigestAt: integer("last_digest_at"),
    onboardedAt: integer("onboarded_at"),
  },
  (t) => [index("idx_user_digest").on(t.digestFrequency, t.lastDigestAt)],
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("idx_session_user").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_account_user").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" }),
  },
  (t) => [index("idx_verification_identifier").on(t.identifier)],
);

/* App tables */

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const userInterests = sqliteTable(
  "user_interests",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.categoryId] })],
);

export const domains = sqliteTable(
  "domains",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Normalized, without `www.` */
    hostname: text("hostname").notNull().unique(),
    token: text("token").notNull(),
    method: text("method").$type<DomainMethod>(),
    verifiedAt: integer("verified_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_domains_user").on(t.userId)],
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    makerId: text("maker_id")
      .notNull()
      .references(() => user.id),
    domainId: text("domain_id")
      .notNull()
      .references(() => domains.id),
    slug: text("slug").notNull().unique(),
    url: text("url").notNull(),
    /** Blocks duplicates */
    urlNormalized: text("url_normalized").notNull().unique(),
    title: text("title").notNull(),
    /** Max 60 characters */
    tagline: text("tagline").notNull(),
    description: text("description").notNull(),
    stage: text("stage").$type<Stage>().notNull(),
    pricing: text("pricing").$type<Pricing>().notNull(),
    feedbackMode: text("feedback_mode").$type<FeedbackMode>().notNull().default("off"),
    roadmapEnabled: integer("roadmap_enabled", { mode: "boolean" }).notNull().default(false),
    status: text("status").$type<ProductStatus>().notNull().default("live"),
    validReportCount: integer("valid_report_count").notNull().default(0),
    viewCount: integer("view_count").notNull().default(0),
    clickCount: integer("click_count").notNull().default(0),
    saveCount: integer("save_count").notNull().default(0),
    publishedAt: integer("published_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("idx_products_status_pub").on(t.status, sql`${t.publishedAt} DESC`),
    index("idx_products_maker").on(t.makerId),
  ],
);

export const productCategories = sqliteTable(
  "product_categories",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    /** Copied from products for a fast feed */
    publishedAt: integer("published_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.categoryId] }), index("idx_pc_cat_pub").on(t.categoryId, sql`${t.publishedAt} DESC`)],
);

export const productImages = sqliteTable(
  "product_images",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    width: integer("width"),
    height: integer("height"),
    source: text("source").$type<"og" | "screenshot" | "upload">().notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("idx_images_product").on(t.productId, t.sortOrder)],
);

export const perks = sqliteTable(
  "perks",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    type: text("type").$type<PerkType>().notNull(),
    title: text("title").notNull(),
    details: text("details"),
    /** For 'coupon' */
    sharedCode: text("shared_code"),
    redeemUrl: text("redeem_url"),
    maxClaims: integer("max_claims"),
    claimCount: integer("claim_count").notNull().default(0),
    expiresAt: integer("expires_at"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("idx_perks_product").on(t.productId)],
);

export const perkCodes = sqliteTable(
  "perk_codes",
  {
    id: text("id").primaryKey(),
    perkId: text("perk_id")
      .notNull()
      .references(() => perks.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    claimedBy: text("claimed_by").references(() => user.id, { onDelete: "set null" }),
    claimedAt: integer("claimed_at"),
  },
  (t) => [index("idx_perk_codes_free").on(t.perkId, t.claimedAt), uniqueIndex("uq_perk_codes_code").on(t.perkId, t.code)],
);

export const perkClaims = sqliteTable(
  "perk_claims",
  {
    perkId: text("perk_id")
      .notNull()
      .references(() => perks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    codeId: text("code_id").references(() => perkCodes.id, { onDelete: "set null" }),
    claimedAt: integer("claimed_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.perkId, t.userId] }), index("idx_perk_claims_user").on(t.userId, t.claimedAt)],
);

export const saves = sqliteTable(
  "saves",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] }), index("idx_saves_user").on(t.userId, sql`${t.createdAt} DESC`)],
);

export const feedback = sqliteTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").$type<FeedbackType>().notNull(),
    body: text("body").notNull(),
    /** Copied from feedback_mode when created */
    isPublic: integer("is_public", { mode: "boolean" }).notNull(),
    makerReply: text("maker_reply"),
    resolvedAt: integer("resolved_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_feedback_product").on(t.productId, sql`${t.createdAt} DESC`), index("idx_feedback_user").on(t.userId, t.createdAt)],
);

export const roadmapItems = sqliteTable(
  "roadmap_items",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").$type<RoadmapStatus>().notNull().default("planned"),
    voteCount: integer("vote_count").notNull().default(0),
    fromFeedbackId: text("from_feedback_id").references(() => feedback.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_roadmap_product").on(t.productId)],
);

export const roadmapVotes = sqliteTable(
  "roadmap_votes",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => roadmapItems.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.userId] }), index("idx_roadmap_votes_user").on(t.userId)],
);

export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reason: text("reason").$type<ReportReason>().notNull(),
    note: text("note"),
    /** 1 when the reporter was eligible (account older than 7 days, confirmed email) */
    counts: integer("counts", { mode: "boolean" }).notNull(),
    outcome: text("outcome").$type<"upheld" | "rejected">(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("uq_reports_product_reporter").on(t.productId, t.reporterId), index("idx_reports_reporter").on(t.reporterId, t.createdAt)],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").$type<NotificationType>().notNull(),
    /** JSON */
    payload: text("payload").notNull(),
    readAt: integer("read_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_notif_user").on(t.userId, sql`${t.createdAt} DESC`)],
);

export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_push_user").on(t.userId)],
);

export const blockedDomains = sqliteTable("blocked_domains", {
  hostname: text("hostname").primaryKey(),
  reason: text("reason"),
});

export const schema = {
  user,
  session,
  account,
  verification,
  categories,
  userInterests,
  domains,
  products,
  productCategories,
  productImages,
  perks,
  perkCodes,
  perkClaims,
  saves,
  feedback,
  roadmapItems,
  roadmapVotes,
  reports,
  notifications,
  pushSubscriptions,
  blockedDomains,
};
