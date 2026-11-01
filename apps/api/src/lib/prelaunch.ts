import { eq } from "drizzle-orm";
import { siteState, type Database } from "@tm/db";
import type { Env } from "../env";

/** How long an isolate trusts its last read of the launch time. */
const LAUNCH_STATE_TTL_MS = 30_000;
const launchState = new WeakMap<D1Database, { readAt: number; launchedAt: number | null }>();

/** When the admin Launch action ran (unix seconds), or null. */
export async function launchedAt(env: Env, db: Database): Promise<number | null> {
  const hit = launchState.get(env.DB);
  if (hit && Date.now() - hit.readAt < LAUNCH_STATE_TTL_MS) return hit.launchedAt;
  const row = await db.select({ launchedAt: siteState.launchedAt }).from(siteState).where(eq(siteState.id, 1)).get();
  const value = row?.launchedAt ?? null;
  launchState.set(env.DB, { readAt: Date.now(), launchedAt: value });
  return value;
}

/** Drops this isolate's cached launch time (after the Launch action). */
export function forgetLaunchState(env: Env): void {
  launchState.delete(env.DB);
}

/**
 * Pre-launch mode, run as the waitlist (docs/PRELAUNCH.md, docs/tiktok-campaign.md): on while the
 * WAITLIST var is "true" and until the admin Launch action sets site_state.launched_at.
 */
export async function isPrelaunch(env: Env, db: Database): Promise<boolean> {
  if (env.WAITLIST !== "true") return false;
  return (await launchedAt(env, db)) === null;
}

/** A YYYY-MM-DD config date (MAKER_ACCESS_DATE, LAUNCH_DATE), or null while it is still a placeholder. */
export function configDate(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? null : value;
}
