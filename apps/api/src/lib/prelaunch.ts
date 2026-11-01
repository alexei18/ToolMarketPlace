import type { Env } from "../env";

/** Pre-launch mode (docs/PRELAUNCH.md). The admin Launch action will add a D1 `launched_at` check here. */
export function isPrelaunch(env: Env): boolean {
  return env.PRELAUNCH === "true";
}
