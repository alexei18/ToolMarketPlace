/*
 * Moderation rules a statement of reasons can cite. Labels quote the Community Guidelines and the
 * Maker Terms (apps/web/src/content/legal); each href points at the section that states the rule.
 * No dependencies, safe for browser bundles.
 */
import type { ReportReason } from "./enums";

export const MODERATION_RULES = {
  listings: { label: "Not allowed in listings", href: "/guidelines#not-allowed-in-listings" },
  spam: { label: "Spam", href: "/guidelines#not-allowed-in-listings" },
  scam: { label: "Scams and misleading listings", href: "/guidelines#not-allowed-in-listings" },
  malware: { label: "Malware", href: "/guidelines#not-allowed-in-listings" },
  illegal: { label: "Illegal content", href: "/guidelines#not-allowed-in-listings" },
  copied: { label: "Copied products", href: "/guidelines#not-allowed-in-listings" },
  harmful: { label: "Harmful content", href: "/guidelines#not-allowed-in-listings" },
  feedback: { label: "Not allowed in feedback and roadmaps", href: "/guidelines#not-allowed-in-feedback-and-roadmaps" },
  ranking: { label: "Fair ranking", href: "/guidelines#fair-ranking" },
  reports: { label: "Reports", href: "/guidelines#reports" },
  repeated: { label: "Serious or repeated problems", href: "/guidelines#what-happens-when-rules-are-broken" },
  domain: { label: "You don't control the domain or don't have the right to list the product", href: "/terms/makers#reasons-for-removal" },
  broken: { label: "The listing is misleading or the website no longer works", href: "/terms/makers#reasons-for-removal" },
  perks: { label: "Perks aren't honoured", href: "/terms/makers#reasons-for-removal" },
} as const;

export type ModerationRule = keyof typeof MODERATION_RULES;
export const MODERATION_RULE_IDS = Object.keys(MODERATION_RULES) as [ModerationRule, ...ModerationRule[]];

/** The rule an automatic hide cites, from the reason most reporters chose. */
export const RULE_FOR_REPORT_REASON: Record<ReportReason, ModerationRule> = {
  spam: "spam",
  scam: "scam",
  dead_link: "broken",
  prohibited: "listings",
  other: "listings",
  illegal: "illegal",
  ip: "copied",
  malware: "malware",
};

/** A decision can be contested once, within this many months (Terms of Service, "Contesting a decision"). */
export const CONTEST_WINDOW_MONTHS = 6;

/** Unix seconds `months` calendar months after `sec` (negative goes back). */
export function addMonths(sec: number, months: number): number {
  const d = new Date(sec * 1000);
  d.setUTCMonth(d.getUTCMonth() + months);
  return Math.floor(d.getTime() / 1000);
}

/** Short code shown to reporters and admins for a report id. */
export const reportReference = (id: string) => `R-${id.slice(-8).toUpperCase()}`;
