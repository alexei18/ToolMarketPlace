/* Ranking rules from docs/RANKING.md. One place to tune them after the first month of real data. */
import type { SignalType } from "../enums";

/** Signals only count from accounts with a confirmed email that are at least this old. */
export const SIGNAL_MIN_ACCOUNT_AGE_DAYS = 3;

/** Feedback counts as a signal only from this many characters (trimmed). */
export const FEEDBACK_SIGNAL_MIN_CHARS = 30;

/** The aggregation job recomputes the daily counts of today and this many days before it. */
export const AGGREGATE_LOOKBACK_DAYS = 1;

/** Points per signal. */
export const SIGNAL_WEIGHTS: Record<SignalType, number> = { save: 3, perk_claim: 4, click: 1, feedback: 3, vote: 1 };

/** Top this week: signals of the last 7 UTC days, today included. */
export const TOP_WINDOW_DAYS = 7;
/** Added to Top this week while a staff pick is active. */
export const STAFF_PICK_BONUS = 15;
/** A staff pick stops counting (and showing) after this many days. */
export const STAFF_PICK_DAYS = 7;
/** Subtracted from Top this week per valid report. */
export const REPORT_PENALTY = 10;

/** Trending = points of the last 48 h ÷ (hours since publishing + 2)^1.5 */
export const TRENDING_WINDOW_HOURS = 48;
export const TRENDING_AGE_OFFSET_HOURS = 2;
export const TRENDING_GRAVITY = 1.5;

/** In Top, every 5th card is a quality product launched in the last 48 h ("Just launched"). */
export const JUST_LAUNCHED_EVERY = 5;
export const JUST_LAUNCHED_MAX_AGE_HOURS = 48;

/** Quality conditions for Top, Trending and the digest (not for publishing). */
export const QUALITY_MIN_DESCRIPTION_CHARS = 80;
/** Link checks per job run: each costs ~3 of the 50 subrequests a free-plan invocation may make. */
export const LINK_CHECKS_PER_RUN = 10;
export const LINK_TIMEOUT_MS = 5000;
/** A link counts as down after this many failed checks in a row. */
export const LINK_MAX_FAILURES = 2;

/** Spike check: a review case opens when young accounts bring most of a product's recent signals. */
export const SPIKE_WINDOW_HOURS = 24;
export const SPIKE_YOUNG_ACCOUNT_DAYS = 7;
/** Share of the window's signals from young accounts above which a case opens. */
export const SPIKE_YOUNG_SHARE = 0.5;
/** Below this many signals in the window no case opens (1 of 1 isn't a spike). */
export const SPIKE_MIN_SIGNALS = 10;
/** No new case for a product within this many hours of the previous one being resolved. */
export const SPIKE_COOLDOWN_HOURS = 24;

/** Digest: top N new products per category, by Top this week. */
export const DIGEST_TOP_PER_CATEGORY = 5;

/** /new lists every live launch of the last this many days (docs/SEO.md). */
export const NEW_PAGE_DAYS = 7;

/** A category's weekly archive exists only for completed weeks with at least this many quality launches (docs/SEO.md). */
export const WEEK_ARCHIVE_MIN_LAUNCHES = 3;

/** UTC day number of a Unix timestamp in seconds (2026-10-27 → 20753). */
export function signalDay(sec: number): number {
  return Math.floor(sec / 86400);
}

/** Whether a staff pick made at `pickedAt` still counts at `now` (seconds). */
export function staffPickActive(pickedAt: number | null, now: number): boolean {
  return pickedAt !== null && pickedAt > now - STAFF_PICK_DAYS * 86400;
}
