/*
 * How long personal data is kept. The daily maintenance job deletes what is older, and the Privacy
 * Policy (apps/web/src/content/legal/privacy.md) states the same numbers; a test keeps them in sync.
 */

/** Email confirmation and password reset tokens are deleted once expired, and never kept longer than this. */
export const VERIFICATION_MAX_AGE_HOURS = 24;

/** Read notifications are deleted after this many days; unread ones stay. */
export const READ_NOTIFICATION_DAYS = 90;

/** A data export can be downloaded for this long, then the file is deleted. */
export const EXPORT_LINK_HOURS = 24;

/** Raw ranking signals (one row per account) are deleted after this many days; the daily totals per product stay. */
export const RAW_SIGNAL_DAYS = 30;

/** The email address on a public report is deleted this many months after the report is decided. */
export const REPORTER_EMAIL_MONTHS = 6;

/** An unconfirmed waitlist sign-up is deleted this many days after its confirmation email went out. */
export const WAITLIST_UNCONFIRMED_DAYS = 7;

/** Every waitlist row is deleted this many months after launch. */
export const WAITLIST_MONTHS_AFTER_LAUNCH = 6;
