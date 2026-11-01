/* Enum values shared by the schema, the API and the UI. No dependencies, safe for browser bundles. */
export const STAGES = ["beta", "launched"] as const;
export const PRICING = ["free", "freemium", "paid"] as const;
export const FEEDBACK_MODES = ["off", "public", "private"] as const;
export const FEEDBACK_TYPES = ["bug", "idea", "praise"] as const;
export const PERK_TYPES = ["free_trial", "extended_trial", "discount", "coupon", "unique_codes"] as const;
export const ROADMAP_STATUSES = ["planned", "in_progress", "shipped"] as const;
/** Reasons on the signed-in "Report this product" dialog. */
export const MEMBER_REPORT_REASONS = ["spam", "scam", "dead_link", "prohibited", "other"] as const;
/** Reasons on the public /report form (docs/LEGAL.md). */
export const PUBLIC_REPORT_REASONS = ["illegal", "ip", "scam", "malware", "other"] as const;
export const REPORT_REASONS = ["spam", "scam", "dead_link", "prohibited", "other", "illegal", "ip", "malware"] as const;
export const REPORT_SOURCES = ["member", "public"] as const;
export const DIGEST_FREQUENCIES = ["daily", "weekly", "off"] as const;
export const PRODUCT_STATUSES = ["live", "hidden", "removed"] as const;
export const NOTIFICATION_TYPES = ["digest", "feedback_reply", "roadmap_shipped", "system", "launch"] as const;
export const DOMAIN_METHODS = ["dns", "meta"] as const;
export const PLATFORMS = ["web", "ios", "android", "extension", "desktop", "api"] as const;
export const SIGNAL_TYPES = ["save", "perk_claim", "click", "feedback", "vote"] as const;
export const RANK_SORTS = ["top", "trending", "new"] as const;
export const REVIEW_CASE_KINDS = ["signal_spike"] as const;
/** Moderation decisions (statements of reasons): what was restricted and how. */
export const DECISION_TARGETS = ["product", "account"] as const;
export const DECISION_ACTIONS = ["hidden", "removed", "suspended"] as const;
export const DECISION_TRIGGERS = ["reports", "admin", "suspension", "rejected_reports", "removed_products"] as const;
export const CONTEST_OUTCOMES = ["upheld", "reversed"] as const;

export type Stage = (typeof STAGES)[number];
export type Pricing = (typeof PRICING)[number];
export type FeedbackMode = (typeof FEEDBACK_MODES)[number];
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];
export type PerkType = (typeof PERK_TYPES)[number];
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];
export type ReportReason = (typeof REPORT_REASONS)[number];
export type DigestFrequency = (typeof DIGEST_FREQUENCIES)[number];
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type DomainMethod = (typeof DOMAIN_METHODS)[number];
export type Platform = (typeof PLATFORMS)[number];
export type SignalType = (typeof SIGNAL_TYPES)[number];
export type RankSort = (typeof RANK_SORTS)[number];
export type ReviewCaseKind = (typeof REVIEW_CASE_KINDS)[number];
export type ReportSource = (typeof REPORT_SOURCES)[number];
export type PublicReportReason = (typeof PUBLIC_REPORT_REASONS)[number];
export type DecisionTarget = (typeof DECISION_TARGETS)[number];
export type DecisionAction = (typeof DECISION_ACTIONS)[number];
export type DecisionTrigger = (typeof DECISION_TRIGGERS)[number];
export type ContestOutcome = (typeof CONTEST_OUTCOMES)[number];
