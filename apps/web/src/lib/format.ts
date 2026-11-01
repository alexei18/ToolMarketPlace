import type { FeedbackType, PerkType, Pricing, RoadmapStatus, Stage } from "@tm/shared";
import { en } from "@tm/shared/copy";

export const STAGE_LABEL: Record<Stage, string> = { beta: en.feed.filters.stage.preLaunch, launched: en.feed.filters.stage.launched };
export const PRICING_LABEL: Record<Pricing, string> = en.feed.filters.pricing;
export const FEEDBACK_TYPE_LABEL: Record<FeedbackType, string> = { bug: "Bug", idea: "Idea", praise: "Praise" };
export const ROADMAP_LABEL: Record<RoadmapStatus, string> = { planned: "Planned", in_progress: "In progress", shipped: "Shipped" };
export const PERK_TYPE_LABEL: Record<PerkType, string> = {
  free_trial: "Free trial",
  extended_trial: "Extended trial",
  discount: "Discount",
  coupon: "Coupon",
  unique_codes: "Unique code",
};

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

/** "just now", "5m", "3h", "2d", then a short date. */
export function timeAgo(unixSeconds: number, now: number = Date.now() / 1000): string {
  const d = Math.max(0, now - unixSeconds);
  if (d < MINUTE) return "just now";
  if (d < HOUR) return `${Math.floor(d / MINUTE)}m ago`;
  if (d < DAY) return `${Math.floor(d / HOUR)}h ago`;
  if (d < 7 * DAY) return `${Math.floor(d / DAY)}d ago`;
  return shortDate(unixSeconds);
}

export function shortDate(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const sameYear = date.getUTCFullYear() === new Date().getUTCFullYear();
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

export function longDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = parts.length >= 2 ? `${parts[0]![0]}${parts[parts.length - 1]![0]}` : (parts[0] ?? "?").slice(0, 2);
  return s.toUpperCase();
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function expiresLabel(expiresAt: number | null): string | null {
  if (!expiresAt) return null;
  const left = expiresAt - Date.now() / 1000;
  if (left <= 0) return "Expired";
  if (left < DAY) return "Ends today";
  if (left < 14 * DAY) return `Ends in ${Math.ceil(left / DAY)} days`;
  return `Until ${shortDate(expiresAt)}`;
}
