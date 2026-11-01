import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { notifications, productSignals, reports, session, siteState, user, verification, waitlist, type Database } from "@tm/db";
import {
  RAW_SIGNAL_DAYS,
  READ_NOTIFICATION_DAYS,
  REPORTER_EMAIL_MONTHS,
  VERIFICATION_MAX_AGE_HOURS,
  WAITLIST_MONTHS_AFTER_LAUNCH,
  WAITLIST_UNCONFIRMED_DAYS,
  addMonths,
} from "@tm/shared";
import type { Env } from "../env";
import { deleteExpiredExports } from "../lib/account";
import { flushCounters } from "../lib/counters";
import { sendEmail } from "../lib/email";
import { createNotifications } from "../lib/notify";

/** Free-plan daily limits we alert on (70%). */
export const FREE_LIMITS = {
  workersRequests: 100_000,
  d1RowsRead: 5_000_000,
  d1RowsWritten: 100_000,
  r2ClassA: 1_000_000 / 30,
  r2ClassB: 10_000_000 / 30,
};
const ALERT_RATIO = 0.7;

/** Daily retention (periods in packages/shared/src/retention.ts, stated in the Privacy Policy). */
export async function cleanup(env: Env, db: Database, nowMs = Date.now()): Promise<void> {
  const now = new Date(nowMs);
  const nowSec = Math.floor(nowMs / 1000);
  await db.batch([
    db.delete(session).where(lt(session.expiresAt, now)),
    db.delete(verification).where(or(lt(verification.expiresAt, now), lt(verification.createdAt, new Date(nowMs - VERIFICATION_MAX_AGE_HOURS * 3_600_000)))),
    db.delete(notifications).where(and(isNotNull(notifications.readAt), lt(notifications.createdAt, nowSec - READ_NOTIFICATION_DAYS * 86400))),
    // Daily totals (product_signal_daily) stay; they hold no user id.
    db.delete(productSignals).where(lt(productSignals.createdAt, nowSec - RAW_SIGNAL_DAYS * 86400)),
    db
      .update(reports)
      .set({ reporterEmail: null })
      .where(and(isNotNull(reports.reporterEmail), lt(reports.decidedAt, addMonths(nowSec, -REPORTER_EMAIL_MONTHS)))),
  ]);
  await cleanupWaitlist(db, nowSec);
  await deleteExpiredExports(env, nowMs);
  await flushCounters(db);
}

/**
 * Unconfirmed sign-ups go WAITLIST_UNCONFIRMED_DAYS after their confirmation email was sent (or
 * after it was refused for good); ones still waiting for the email quota stay. The whole waitlist
 * goes WAITLIST_MONTHS_AFTER_LAUNCH after launch.
 */
async function cleanupWaitlist(db: Database, nowSec: number): Promise<void> {
  const cutoff = nowSec - WAITLIST_UNCONFIRMED_DAYS * 86400;
  await db
    .delete(waitlist)
    .where(and(isNull(waitlist.confirmedAt), or(lt(waitlist.confirmationSentAt, cutoff), and(isNull(waitlist.confirmationSentAt), lt(waitlist.emailFailedAt, cutoff)))));
  const state = await db.select({ launchedAt: siteState.launchedAt }).from(siteState).where(eq(siteState.id, 1)).get();
  if (state?.launchedAt && nowSec >= addMonths(state.launchedAt, WAITLIST_MONTHS_AFTER_LAUNCH)) await db.delete(waitlist);
}

interface UsageNumbers {
  workersRequests: number;
  d1RowsRead: number;
  d1RowsWritten: number;
  r2ClassA: number;
  r2ClassB: number;
}

const R2_CLASS_A = new Set(["ListBuckets", "PutBucket", "ListObjects", "PutObject", "CopyObject", "CompleteMultipartUpload", "CreateMultipartUpload", "UploadPart", "UploadPartCopy", "ListMultipartUploads", "ListParts", "PutBucketEncryption", "PutBucketCors", "PutBucketLifecycleConfiguration"]);

/** Yesterday's usage from the Cloudflare GraphQL Analytics API (needs CF_ACCOUNT_ID + CF_API_TOKEN with Analytics read). */
export async function fetchUsage(env: Env, nowMs = Date.now()): Promise<UsageNumbers | null> {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) return null;
  const day = new Date(nowMs - 86400_000).toISOString().slice(0, 10);
  const query = `query Usage($account: string!, $day: Date!, $start: Time!, $end: Time!) {
    viewer { accounts(filter: { accountTag: $account }) {
      workersInvocationsAdaptive(limit: 10000, filter: { datetime_geq: $start, datetime_lt: $end }) { sum { requests } }
      d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date: $day }) { sum { rowsRead rowsWritten } }
      r2OperationsAdaptiveGroups(limit: 10000, filter: { datetime_geq: $start, datetime_lt: $end }) { sum { requests } dimensions { actionType } }
    } }
  }`;
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { account: env.CF_ACCOUNT_ID, day, start: `${day}T00:00:00Z`, end: `${day}T23:59:59Z` } }),
  });
  if (!res.ok) throw new Error(`GraphQL ${res.status}`);
  const json = (await res.json()) as {
    errors?: { message: string }[];
    data?: {
      viewer: {
        accounts: {
          workersInvocationsAdaptive: { sum: { requests: number } }[];
          d1AnalyticsAdaptiveGroups: { sum: { rowsRead: number; rowsWritten: number } }[];
          r2OperationsAdaptiveGroups: { sum: { requests: number }; dimensions: { actionType: string } }[];
        }[];
      };
    };
  };
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  const acc = json.data?.viewer.accounts[0];
  if (!acc) return null;
  const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + (f(x) || 0), 0);
  return {
    workersRequests: sum(acc.workersInvocationsAdaptive, (x) => x.sum.requests),
    d1RowsRead: sum(acc.d1AnalyticsAdaptiveGroups, (x) => x.sum.rowsRead),
    d1RowsWritten: sum(acc.d1AnalyticsAdaptiveGroups, (x) => x.sum.rowsWritten),
    r2ClassA: sum(acc.r2OperationsAdaptiveGroups.filter((x) => R2_CLASS_A.has(x.dimensions.actionType)), (x) => x.sum.requests),
    r2ClassB: sum(acc.r2OperationsAdaptiveGroups.filter((x) => !R2_CLASS_A.has(x.dimensions.actionType)), (x) => x.sum.requests),
  };
}

export function usageAlerts(u: UsageNumbers): string[] {
  const out: string[] = [];
  for (const key of Object.keys(FREE_LIMITS) as (keyof UsageNumbers)[]) {
    const ratio = u[key] / FREE_LIMITS[key];
    if (ratio >= ALERT_RATIO) out.push(`${key}: ${Math.round(u[key]).toLocaleString("en-US")} (${Math.round(ratio * 100)}% of the free daily limit)`);
  }
  return out;
}

/** Daily check: warns admins (notification center + email) when any free-plan quota passes 70%. */
export async function checkUsage(env: Env, db: Database, nowMs = Date.now()): Promise<string[]> {
  let usage: UsageNumbers | null;
  try {
    usage = await fetchUsage(env, nowMs);
  } catch (err) {
    console.error("[usage] check failed", err);
    return [];
  }
  if (!usage) return [];
  const alerts = usageAlerts(usage);
  if (alerts.length === 0) return [];

  const emails = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const admins = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(emails.length ? inArray(user.email, emails) : eq(user.role, "admin"))
    .all();
  const roleAdmins = await db.select({ id: user.id, email: user.email }).from(user).where(eq(user.role, "admin")).all();
  const all = new Map([...admins, ...roleAdmins].map((a) => [a.id, a]));
  await createNotifications(
    db,
    [...all.values()].map((a) => ({ userId: a.id, type: "system" as const, payload: { kind: "system" as const, title: "Cloudflare usage above 70%", body: alerts.join("\n") } })),
  );
  for (const a of all.values()) {
    await sendEmail(env, { to: a.email, subject: `${env.SITE_NAME}: Cloudflare usage above 70%`, lines: ["Yesterday's usage is close to the free plan limits:", ...alerts, "Consider moving to the Workers Paid plan ($5/month)."] }).catch((e) =>
      console.error("[usage] email failed", e),
    );
  }
  return alerts;
}
