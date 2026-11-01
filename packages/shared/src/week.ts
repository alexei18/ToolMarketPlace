/* ISO weeks (Monday to Sunday, UTC) for the weekly category archives, e.g. /c/design/week/2026-44. */

const DAY = 86400;
export const WEEK_SECONDS = 7 * DAY;
/** 1970-01-05, the first Monday after the Unix epoch: week index 0 starts here. */
export const EPOCH_MONDAY = 4 * DAY;

export interface IsoWeek {
  /** Index of the week counted from EPOCH_MONDAY (what the API groups by) */
  index: number;
  year: number;
  week: number;
  /** "2026-44", as used in URLs */
  slug: string;
}

/** Index of the week that contains `sec` (Unix seconds). */
export function weekIndex(sec: number): number {
  return Math.floor((sec - EPOCH_MONDAY) / WEEK_SECONDS);
}

/** Unix seconds of the Monday 00:00 UTC that starts week `index`. */
export function weekStart(index: number): number {
  return EPOCH_MONDAY + index * WEEK_SECONDS;
}

/** ISO year and week number of week `index`: the year its Thursday falls in. */
export function isoWeek(index: number): IsoWeek {
  const thursday = weekStart(index) + 3 * DAY;
  const year = new Date(thursday * 1000).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1) / 1000) / WEEK_SECONDS) + 1;
  return { index, year, week, slug: `${year}-${String(week).padStart(2, "0")}` };
}

/** Parses "2026-44" into a week; null for anything else, including week 53 in a 52-week year. */
export function parseWeek(slug: string): IsoWeek | null {
  const m = slug.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  // Week 1 is the week that contains January 4.
  const first = weekIndex(Date.UTC(Number(m[1]), 0, 4) / 1000);
  const w = isoWeek(first + Number(m[2]) - 1);
  return w.slug === slug ? w : null;
}
