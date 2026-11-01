/* Pre-launch rules from docs/PRELAUNCH.md. */

/** The homepage "Top this week" block needs at least this many quality products. */
export const HOME_TOP_MIN = 6;

/* Waitlist (docs/tiktok-campaign.md). The "[N] people are waiting" threshold is WAITLIST_COUNT_MIN in limits.ts. */

/** Explorers pick up to this many categories; makers name at most one (their product's). */
export const WAITLIST_INTERESTS_MAX = 5;

/** A confirmation link works this long. */
export const WAITLIST_CONFIRM_HOURS = 48;

/** A maker's early-access invite link works this long. */
export const WAITLIST_INVITE_DAYS = 30;

/** Submitting the same email again resends the email at most this often. */
export const WAITLIST_RESEND_MINUTES = 10;

/** "2026-12-08" → "December 8, 2026" (config dates are calendar days, read in UTC). */
export function longDate(isoDay: string): string {
  return new Date(`${isoDay}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** In pre-launch, categories with fewer quality products are left out of navigation. */
export const CATEGORY_MIN_ELIGIBLE = 3;
