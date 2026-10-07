/** Per-account limits and moderation thresholds. Every value can be overridden through an env var of the same name. */
export const DEFAULT_LIMITS = {
  PRODUCTS_PER_DAY: 3,
  PRODUCTS_PER_WEEK: 10,
  FEEDBACK_PER_DAY: 20,
  REPORTS_PER_DAY: 10,
  PERK_CLAIMS_PER_DAY: 20,
  IMAGES_PER_PRODUCT: 6,
  IMAGE_MAX_BYTES: 5 * 1024 * 1024,
  ANON_REQUESTS_PER_MINUTE: 60,
  /** How many products a visitor (no account) sees per category. */
  VISITOR_CATEGORY_LIMIT: 12,
  /** Valid reports needed to auto-hide a product. */
  REPORT_HIDE_THRESHOLD: 3,
  /** Reports only count from accounts at least this old (and with a confirmed email). */
  REPORT_MIN_ACCOUNT_AGE_DAYS: 7,
  /** Maker is banned automatically after this many products removed by review. */
  MAKER_BAN_REMOVED_PRODUCTS: 3,
  /** User is banned automatically after this many rejected reports. */
  USER_BAN_REJECTED_REPORTS: 5,
  /** Max products in one digest. */
  DIGEST_MAX_ITEMS: 10,
} as const;

export type Limits = { -readonly [K in keyof typeof DEFAULT_LIMITS]: number };

export function resolveLimits(env: Record<string, unknown> = {}): Limits {
  const out = { ...DEFAULT_LIMITS } as Limits;
  for (const key of Object.keys(DEFAULT_LIMITS) as (keyof Limits)[]) {
    const raw = env[key];
    const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (Number.isFinite(n) && n >= 0) out[key] = n;
  }
  return out;
}

export const TAGLINE_MAX = 60;
export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 4000;
export const PRODUCT_CATEGORIES_MIN = 1;
export const PRODUCT_CATEGORIES_MAX = 3;
export const INTERESTS_MIN = 3;
export const FEEDBACK_MAX = 2000;
export const REPLY_MAX = 2000;
export const PAGE_SIZE = 20;
