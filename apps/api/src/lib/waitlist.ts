import { and, eq, isNotNull } from "drizzle-orm";
import { waitlist, type Database } from "@tm/db";
import type { Env } from "../env";

/** Admin addresses from ADMIN_EMAILS, lowercased. */
export function adminEmails(env: Env): string[] {
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * While the waitlist runs, only admins and makers who got the early-access invite can create an
 * account; everyone else joins the waitlist.
 */
export async function mayCreateAccountDuringWaitlist(env: Env, db: Database, email: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  if (adminEmails(env).includes(e)) return true;
  const row = await db
    .select({ id: waitlist.id })
    .from(waitlist)
    .where(and(eq(waitlist.email, e), eq(waitlist.role, "maker"), isNotNull(waitlist.invitedAt)))
    .get();
  return !!row;
}
