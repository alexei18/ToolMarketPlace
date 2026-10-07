/* Enum values shared by the schema, the API and the UI. No dependencies, safe for browser bundles. */
export const STAGES = ["beta", "launched"] as const;
export const PRICING = ["free", "freemium", "paid"] as const;
export const FEEDBACK_MODES = ["off", "public", "private"] as const;
export const FEEDBACK_TYPES = ["bug", "idea", "praise"] as const;
export const PERK_TYPES = ["free_trial", "extended_trial", "discount", "coupon", "unique_codes"] as const;
export const ROADMAP_STATUSES = ["planned", "in_progress", "shipped"] as const;
export const REPORT_REASONS = ["spam", "scam", "dead_link", "prohibited", "other"] as const;
export const DIGEST_FREQUENCIES = ["daily", "weekly", "off"] as const;
export const PRODUCT_STATUSES = ["live", "hidden", "removed"] as const;
export const NOTIFICATION_TYPES = ["digest", "feedback_reply", "roadmap_shipped", "system"] as const;
export const DOMAIN_METHODS = ["dns", "meta"] as const;

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
