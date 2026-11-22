import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type {
  ContestOutcome,
  DecisionAction,
  DecisionTarget,
  DecisionTrigger,
  DigestFrequency,
  DomainMethod,
  FeedbackMode,
  FoundVia,
  FeedbackType,
  NotificationType,
  PerkType,
  Platform,
  Pricing,
  ProductStatus,
  ModerationRule,
  ReportReason,
  ReportSource,
  ReviewCaseKind,
  RoadmapStatus,
  SignalType,
  Stage,
  WaitlistRole,
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
    /** TERMS_VERSION the user last accepted (sign-up, onboarding or the "Terms updated" notice); null = never. */
    termsVersion: text("terms_version"),
    termsAcceptedAt: integer("terms_accepted_at"),
    /** First-touch source from the landing URL, saved at sign-up (docs/PRELAUNCH.md). */
    utmSource: text("utm_source"),
    utmCampaign: text("utm_campaign"),
    utmContent: text("utm_content"),
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
    /** Declared by the maker ("Includes AI features") */
    hasAi: integer("has_ai", { mode: "boolean" }).notNull().default(false),
    platforms: text("platforms", { mode: "json" }).$type<Platform[]>().notNull().default(["web"]),
    staffPickAt: integer("staff_pick_at"),
    staffPickNote: text("staff_pick_note"),
    /** Written by the ranking job (docs/RANKING.md) */
    scoreWeek: real("score_week").notNull().default(0),
    scoreTrending: real("score_trending").notNull().default(0),
    qualityOk: integer("quality_ok", { mode: "boolean" }).notNull().default(false),
    rankedAt: integer("ranked_at"),
    /** Link health for the quality conditions (set at publish, then rechecked in rotation). */
    linkCheckedAt: integer("link_checked_at"),
    linkFailures: integer("link_failures").notNull().default(0),
  },
  (t) => [
    index("idx_products_status_pub").on(t.status, sql`${t.publishedAt} DESC`),
    index("idx_products_maker").on(t.makerId),
    index("idx_products_top").on(t.status, t.qualityOk, sql`${t.scoreWeek} DESC`),
    index("idx_products_trending").on(t.status, t.qualityOk, sql`${t.scoreTrending} DESC`),
    index("idx_products_link_check").on(t.status, t.linkCheckedAt),
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
    /** Null once the author deleted their account: public feedback stays, shown as "Deleted user". */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
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
    /** Null for public reports (the /report form, no account needed). */
    reporterId: text("reporter_id").references(() => user.id, { onDelete: "cascade" }),
    source: text("source").$type<ReportSource>().notNull().default("member"),
    /** Public reports, optional; cleared REPORTER_EMAIL_MONTHS after the report is decided. */
    reporterEmail: text("reporter_email"),
    reason: text("reason").$type<ReportReason>().notNull(),
    /** Member note, or the explanation on a public report */
    note: text("note"),
    /** Public reports: the good-faith statement was confirmed */
    goodFaith: integer("good_faith", { mode: "boolean" }),
    /** 1 when the reporter was eligible (account older than 7 days, confirmed email) */
    counts: integer("counts", { mode: "boolean" }).notNull(),
    outcome: text("outcome").$type<"upheld" | "rejected">(),
    decidedAt: integer("decided_at"),
    /** The decision that upheld the report; null when it was rejected. */
    decisionId: text("decision_id").references(() => moderationDecisions.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("uq_reports_product_reporter").on(t.productId, t.reporterId),
    index("idx_reports_reporter").on(t.reporterId, t.createdAt),
    index("idx_reports_created").on(t.createdAt),
    index("idx_reports_email_retention").on(t.decidedAt).where(sql`${t.reporterEmail} IS NOT NULL`),
  ],
);

/**
 * Statements of reasons: one row each time a product is hidden or removed or an account is suspended
 * (docs/LEGAL.md). Each can be contested once. Rows outlive the product and the account (ids set null)
 * so the monthly counts don't change.
 */
export const moderationDecisions = sqliteTable(
  "moderation_decisions",
  {
    id: text("id").primaryKey(),
    targetType: text("target_type").$type<DecisionTarget>().notNull(),
    productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
    /** The maker, or the suspended account */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** A product hidden because its maker was suspended points at the suspension. */
    parentId: text("parent_id").references((): AnySQLiteColumn => moderationDecisions.id, { onDelete: "set null" }),
    action: text("action").$type<DecisionAction>().notNull(),
    trigger: text("trigger").$type<DecisionTrigger>().notNull(),
    automated: integer("automated", { mode: "boolean" }).notNull(),
    rule: text("rule").$type<ModerationRule>().notNull(),
    /** Plain-language explanation shown to the user */
    facts: text("facts").notNull(),
    /** The admin; null when automated */
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull(),
    reversedAt: integer("reversed_at"),
    reversedBy: text("reversed_by").references(() => user.id, { onDelete: "set null" }),
    contestBody: text("contest_body"),
    contestedAt: integer("contested_at"),
    contestOutcome: text("contest_outcome").$type<ContestOutcome>(),
    contestResponse: text("contest_response"),
    contestResolvedAt: integer("contest_resolved_at"),
    contestResolvedBy: text("contest_resolved_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    index("idx_decisions_user").on(t.userId, sql`${t.createdAt} DESC`),
    index("idx_decisions_product").on(t.productId, sql`${t.createdAt} DESC`),
    index("idx_decisions_parent").on(t.parentId),
    index("idx_decisions_created").on(t.createdAt),
    index("idx_decisions_open_contests").on(t.contestedAt).where(sql`${t.contestedAt} IS NOT NULL AND ${t.contestResolvedAt} IS NULL`),
  ],
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

/**
 * Raw ranking signals, inserted in the request. One per user, product and type per UTC day;
 * saves and perk claims once per user and product ever (partial unique index).
 */
export const productSignals = sqliteTable(
  "product_signals",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").$type<SignalType>().notNull(),
    /** UTC day number (unix seconds / 86400) */
    day: integer("day").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("uq_signals_product_user_type_day").on(t.productId, t.userId, t.type, t.day),
    uniqueIndex("uq_signals_once")
      .on(t.productId, t.userId, t.type)
      .where(sql`${t.type} in ('save', 'perk_claim')`),
    index("idx_signals_day").on(t.day),
  ],
);

/** Signals counted per product, day and type by the scheduled job. */
export const productSignalDaily = sqliteTable(
  "product_signal_daily",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    day: integer("day").notNull(),
    type: text("type").$type<SignalType>().notNull(),
    count: integer("count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.day, t.type] }), index("idx_signal_daily_day").on(t.day)],
);

/** Moderation cases that don't hide the product (signal spikes). An open case keeps it out of Top and Trending. */
export const reviewCases = sqliteTable(
  "review_cases",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ReviewCaseKind>().notNull(),
    /** JSON */
    details: text("details").notNull(),
    createdAt: integer("created_at").notNull(),
    resolvedAt: integer("resolved_at"),
    resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [index("idx_review_cases_product").on(t.productId, t.resolvedAt), index("idx_review_cases_open").on(t.resolvedAt, sql`${t.createdAt} DESC`)],
);

/** One row per deleted account, with nothing but the time of deletion. */
export const accountDeletions = sqliteTable("account_deletions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deletedAt: integer("deleted_at").notNull(),
});

export const blockedDomains = sqliteTable("blocked_domains", {
  hostname: text("hostname").primaryKey(),
  reason: text("reason"),
});

/**
 * Email waitlist (docs/tiktok-campaign.md). A row is pending until the confirmation link is used;
 * no IP address is stored. Every row is deleted 6 months after launch (packages/shared/src/retention.ts).
 */
export const waitlist = sqliteTable(
  "waitlist",
  {
    id: text("id").primaryKey(),
    /** Trimmed and lowercased by the API. */
    email: text("email").notNull().unique(),
    role: text("role").$type<WaitlistRole>().notNull(),
    /** JSON array of category ids: up to 5 for explorers, at most 1 (their product's category) for makers. */
    interests: text("interests").notNull().default("[]"),
    productUrl: text("product_url"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmContent: text("utm_content"),
    foundVia: text("found_via").$type<FoundVia>(),
    /** Personal share code: /?ref=CODE */
    refCode: text("ref_code").notNull().unique(),
    /** The waitlist row whose share link brought this person. */
    referredBy: text("referred_by").references((): AnySQLiteColumn => waitlist.id, { onDelete: "set null" }),
    confirmedAt: integer("confirmed_at"),
    /** The confirmation email could not be sent yet (email quota or rate limit); the cron retries it. */
    confirmationQueued: integer("confirmation_queued", { mode: "boolean" }).notNull().default(false),
    /** When the last confirmation email actually went out; unconfirmed rows are deleted 7 days later. */
    confirmationSentAt: integer("confirmation_sent_at"),
    /** Last email that the provider refused for good (not a quota or rate limit), with its error. Cleared on the next success. */
    emailFailedAt: integer("email_failed_at"),
    emailError: text("email_error"),
    /** Makers: the early-access invite. Explorers: the launch invite. */
    invitedAt: integer("invited_at"),
    unsubscribedAt: integer("unsubscribed_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_waitlist_referred_by").on(t.referredBy).where(sql`${t.referredBy} IS NOT NULL`),
    index("idx_waitlist_confirmed").on(t.confirmedAt).where(sql`${t.confirmedAt} IS NOT NULL`),
    index("idx_waitlist_pending").on(t.confirmationSentAt).where(sql`${t.confirmedAt} IS NULL`),
    index("idx_waitlist_queued").on(t.createdAt).where(sql`${t.confirmationQueued} = 1`),
    index("idx_waitlist_invites").on(t.role, t.invitedAt).where(sql`${t.confirmedAt} IS NOT NULL AND ${t.unsubscribedAt} IS NULL`),
  ],
);

/** A single row (id 1), set by the admin "Invite makers" and "Launch" actions. */
export const siteState = sqliteTable("site_state", {
  id: integer("id").primaryKey(),
  makersInvitedAt: integer("makers_invited_at"),
  launchedAt: integer("launched_at"),
});

/** Emails per UTC day, counted where they are sent, so the admin can watch the email plan's daily and monthly limits. */
export const emailUsage = sqliteTable("email_usage", {
  /** UTC day number (unix seconds / 86400) */
  day: integer("day").primaryKey(),
  sent: integer("sent").notNull().default(0),
  /** Refused because of the provider's quota or rate limit; retried later. */
  deferred: integer("deferred").notNull().default(0),
  /** Refused for good (bad address, rejected content…). */
  failed: integer("failed").notNull().default(0),
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
  moderationDecisions,
  notifications,
  pushSubscriptions,
  productSignals,
  productSignalDaily,
  reviewCases,
  accountDeletions,
  blockedDomains,
  waitlist,
  siteState,
  emailUsage,
};
