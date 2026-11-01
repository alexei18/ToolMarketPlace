import { and, count, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { categories, emailUsage, siteState, waitlist } from "@tm/db";
import {
  WAITLIST_INVITE_CONFIRM,
  WAITLIST_LAUNCH_CONFIRM,
  WAITLIST_RESEND_MINUTES,
  normalizeUrl,
  nowSec,
  newId,
  waitlistJoinSchema,
  waitlistTokenSchema,
  type WaitlistConfirmedDTO,
  type WaitlistStatsDTO,
} from "@tm/shared";
import { takeMintedLink } from "../auth";
import type { AppEnv } from "../env";
import { purgeWebPaths } from "../lib/cache";
import { ApiError, notFound } from "../lib/errors";
import { configDate, forgetLaunchState, isPrelaunch } from "../lib/prelaunch";
import { requireTurnstile } from "../lib/turnstile";
import { body } from "../lib/validate";
import { newRefCode, processWaitlistEmails, resendMakerInvite, sendConfirmation, verifyToken, type WaitlistRow } from "../lib/waitlist";
import { clientIp, isInternalCall, requireAdmin } from "../middleware";

const app = new Hono<AppEnv>();

/**
 * Joins the waitlist (docs/tiktok-campaign.md). The answer is the same whether the email is new,
 * pending, confirmed or waiting for the email quota, so nobody can tell who is on the list.
 * Submitting again resends the confirmation (or a maker's invite), never a second row.
 */
app.post("/waitlist", async (c) => {
  const db = c.get("db");
  if (!(await isPrelaunch(c.env, db))) throw new ApiError("GONE", "The waitlist is closed.");
  const ip = clientIp(c);
  if (c.env.WAITLIST_LIMITER && !isInternalCall(c)) {
    const { success } = await c.env.WAITLIST_LIMITER.limit({ key: `ip:${ip ?? "unknown"}` });
    if (!success) throw new ApiError("RATE_LIMITED", "Too many attempts. Wait a minute and try again.");
  }
  const input = await body(c, waitlistJoinSchema);
  await requireTurnstile(c.env, input.turnstileToken ?? undefined, ip);

  const known = input.interests.length ? await db.select({ id: categories.id }).from(categories).where(inArray(categories.id, input.interests)).all() : [];
  const interests = JSON.stringify(input.interests.filter((id) => known.some((k) => k.id === id)));
  const productUrl = input.role === "maker" && input.productUrl ? normalizeUrl(input.productUrl) : null;
  const now = nowSec();

  let row = await db.select().from(waitlist).where(eq(waitlist.email, input.email)).get();
  if (!row) {
    const referrer = input.ref ? await db.select({ id: waitlist.id }).from(waitlist).where(and(eq(waitlist.refCode, input.ref.toLowerCase()), isNotNull(waitlist.confirmedAt))).get() : null;
    const created = await db
      .insert(waitlist)
      .values({
        id: newId(),
        email: input.email,
        role: input.role,
        interests,
        productUrl,
        utmSource: input.utm?.source ?? null,
        utmMedium: input.utm?.medium ?? null,
        utmCampaign: input.utm?.campaign ?? null,
        utmContent: input.utm?.content ?? null,
        foundVia: input.foundVia ?? null,
        refCode: newRefCode(),
        referredBy: referrer?.id ?? null,
        createdAt: now,
      })
      .onConflictDoNothing({ target: waitlist.email })
      .returning()
      .get();
    if (created) {
      await sendConfirmation(c.env, db, created);
      return c.json({ ok: true });
    }
    // Submitted twice at the same moment: carry on with the row the other request created.
    row = (await db.select().from(waitlist).where(eq(waitlist.email, input.email)).get())!;
  }

  if (!row.confirmedAt) {
    row = (await db.update(waitlist).set({ role: input.role, interests, productUrl, foundVia: input.foundVia ?? row.foundVia }).where(eq(waitlist.id, row.id)).returning().get())!;
  }
  const sentRecently = row.confirmationSentAt !== null && now - row.confirmationSentAt < WAITLIST_RESEND_MINUTES * 60;
  if (row.confirmationQueued || sentRecently) return c.json({ ok: true });
  if (row.role === "maker" && row.confirmedAt && row.invitedAt && !row.unsubscribedAt) await resendMakerInvite(c.env, db, row);
  else await sendConfirmation(c.env, db, row);
  return c.json({ ok: true });
});

async function readToken(c: Context<AppEnv>, purpose: "confirm" | "unsubscribe" | "invite", raw: string): Promise<WaitlistRow> {
  const check = await verifyToken(c.env, purpose, raw);
  if (!check.ok) throw check.reason === "expired" ? new ApiError("GONE", "This link has expired.") : notFound("This link doesn't work.");
  const row = await c.get("db").select().from(waitlist).where(eq(waitlist.id, check.id)).get();
  // Unconfirmed sign-ups are deleted after a while; their links then count as expired.
  if (!row) throw new ApiError("GONE", "This link has expired.");
  return row;
}

/** The confirmation link. Confirming again (or after unsubscribing) is fine and shows the same page. */
app.post("/waitlist/confirm", async (c) => {
  const db = c.get("db");
  const { token } = await body(c, waitlistTokenSchema);
  const row = await readToken(c, "confirm", token);
  if (!row.confirmedAt || row.unsubscribedAt) {
    await db.update(waitlist).set({ confirmedAt: row.confirmedAt ?? nowSec(), unsubscribedAt: null, confirmationQueued: false }).where(eq(waitlist.id, row.id));
  }
  const referrals = await db
    .select({ n: count() })
    .from(waitlist)
    .where(and(eq(waitlist.referredBy, row.id), isNotNull(waitlist.confirmedAt)))
    .get();
  const out: WaitlistConfirmedDTO = {
    role: row.role,
    hasInterests: row.interests !== "[]",
    refCode: row.refCode,
    referrals: referrals?.n ?? 0,
    makerAccessDate: configDate(c.env.MAKER_ACCESS_DATE),
    launchDate: configDate(c.env.LAUNCH_DATE),
  };
  c.header("Cache-Control", "private, no-store");
  return c.json(out);
});

/**
 * Unsubscribe: from the page (JSON body) or one click in the mail app (RFC 8058: a POST to the
 * List-Unsubscribe URL with the token in the query).
 */
app.post("/waitlist/unsubscribe", async (c) => {
  const fromQuery = c.req.query("t");
  const token = fromQuery ?? (await body(c, waitlistTokenSchema)).token;
  const row = await readToken(c, "unsubscribe", token);
  if (!row.unsubscribedAt) await c.get("db").update(waitlist).set({ unsubscribedAt: nowSec() }).where(eq(waitlist.id, row.id));
  return c.json({ ok: true });
});

/**
 * The maker invite link (called by the site's /join page): returns a fresh, short-lived Better Auth
 * magic link that creates the account (or signs in) and opens onboarding.
 */
app.post("/waitlist/join", async (c) => {
  const { token } = await body(c, waitlistTokenSchema);
  const row = await readToken(c, "invite", token);
  if (row.role !== "maker" || !row.invitedAt) throw notFound("This link doesn't work.");
  const webOrigin = c.env.WEB_ORIGIN.replace(/\/$/, "");
  await c.get("auth").api.signInMagicLink({
    body: { email: row.email, callbackURL: `${webOrigin}/dashboard`, newUserCallbackURL: `${webOrigin}/onboarding`, errorCallbackURL: `${webOrigin}/login` },
    headers: new Headers(),
  });
  const url = takeMintedLink(row.email);
  if (!url) throw new ApiError("INTERNAL", "Could not create the sign-in link.");
  c.header("Cache-Control", "private, no-store");
  return c.json({ url });
});

/* Admin (/admin/waitlist on the site). */

app.get("/admin/waitlist/stats", async (c) => {
  requireAdmin(c);
  const db = c.get("db");
  const days = Math.min(Math.max(Number(c.req.query("days")) || 30, 1), 365);
  const now = nowSec();
  const since = now - days * 86400;
  const today = Math.floor(now / 86400);
  const monthStart = Math.floor(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1) / 86_400_000);
  const w = waitlist;
  const referrer = alias(waitlist, "referrer");
  const [totals, daily, foundVia, referrers, failed, usage, state] = await db.batch([
    db
      .select({
        pending: sql<number>`coalesce(sum(${w.confirmedAt} IS NULL), 0)`,
        queued: sql<number>`coalesce(sum(${w.confirmationQueued}), 0)`,
        failed: sql<number>`coalesce(sum(${w.emailFailedAt} IS NOT NULL), 0)`,
        explorers: sql<number>`coalesce(sum(${w.confirmedAt} IS NOT NULL AND ${w.unsubscribedAt} IS NULL AND ${w.role} = 'explorer'), 0)`,
        makers: sql<number>`coalesce(sum(${w.confirmedAt} IS NOT NULL AND ${w.unsubscribedAt} IS NULL AND ${w.role} = 'maker'), 0)`,
        unsubscribed: sql<number>`coalesce(sum(${w.unsubscribedAt} IS NOT NULL), 0)`,
        makersLeft: sql<number>`coalesce(sum(${w.role} = 'maker' AND ${w.confirmedAt} IS NOT NULL AND ${w.unsubscribedAt} IS NULL AND ${w.invitedAt} IS NULL AND ${w.emailFailedAt} IS NULL), 0)`,
        explorersLeft: sql<number>`coalesce(sum(${w.role} = 'explorer' AND ${w.confirmedAt} IS NOT NULL AND ${w.unsubscribedAt} IS NULL AND ${w.invitedAt} IS NULL AND ${w.emailFailedAt} IS NULL), 0)`,
      })
      .from(w),
    db
      .select({ day: sql<string>`date(${w.confirmedAt}, 'unixepoch')`, role: w.role, campaign: sql<string>`coalesce(${w.utmCampaign}, '')`, n: count() })
      .from(w)
      .where(sql`${w.confirmedAt} >= ${since}`)
      .groupBy(sql`1`, sql`2`, sql`3`)
      .orderBy(sql`1`),
    db
      .select({ foundVia: sql<string>`coalesce(${w.foundVia}, '')`, n: count() })
      .from(w)
      .where(isNotNull(w.confirmedAt))
      .groupBy(sql`1`)
      .orderBy(sql`2 DESC`),
    db
      .select({ email: referrer.email, refCode: referrer.refCode, n: count() })
      .from(w)
      .innerJoin(referrer, eq(referrer.id, w.referredBy))
      .where(isNotNull(w.confirmedAt))
      .groupBy(referrer.id)
      .orderBy(desc(count()))
      .limit(20),
    db.select({ email: w.email, error: w.emailError, at: w.emailFailedAt }).from(w).where(isNotNull(w.emailFailedAt)).orderBy(sql`${w.emailFailedAt} DESC`).limit(50),
    db.select().from(emailUsage).where(gt(emailUsage.day, today - 31)).orderBy(desc(emailUsage.day)),
    db.select().from(siteState).where(eq(siteState.id, 1)),
  ]);
  const t = totals[0]!;
  const dayString = (d: number) => new Date(d * 86_400_000).toISOString().slice(0, 10);
  const out: WaitlistStatsDTO = {
    totals: { pending: t.pending, queued: t.queued, failed: t.failed, explorers: t.explorers, makers: t.makers, unsubscribed: t.unsubscribed },
    daily,
    foundVia,
    topReferrers: referrers,
    failedEmails: failed.map((f) => ({ email: f.email, error: f.error, at: f.at! })),
    emailUsage: usage.map((u) => ({ day: dayString(u.day), sent: u.sent, deferred: u.deferred, failed: u.failed })),
    emailsThisMonth: usage.filter((u) => u.day >= monthStart).reduce((sum, u) => sum + u.sent, 0),
    invites: { makersInvitedAt: state[0]?.makersInvitedAt ?? null, launchedAt: state[0]?.launchedAt ?? null, makersLeft: t.makersLeft, explorersLeft: t.explorersLeft },
  };
  c.header("Cache-Control", "private, no-store");
  return c.json(out);
});

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const isoTime = (sec: number | null) => (sec ? new Date(sec * 1000).toISOString() : "");

/** Every waitlist row as CSV. */
app.get("/admin/waitlist.csv", async (c) => {
  requireAdmin(c);
  const rows = await c.get("db").select().from(waitlist).orderBy(waitlist.createdAt).all();
  const byId = new Map(rows.map((r) => [r.id, r.refCode]));
  const head = ["email", "role", "interests", "product_url", "utm_source", "utm_medium", "utm_campaign", "utm_content", "found_via", "ref_code", "referred_by_code", "created_at", "confirmation_sent_at", "confirmed_at", "invited_at", "unsubscribed_at", "email_error"];
  const lines = rows.map((r) =>
    [r.email, r.role, r.interests, r.productUrl, r.utmSource, r.utmMedium, r.utmCampaign, r.utmContent, r.foundVia, r.refCode, r.referredBy ? byId.get(r.referredBy) : "", isoTime(r.createdAt), isoTime(r.confirmationSentAt), isoTime(r.confirmedAt), isoTime(r.invitedAt), isoTime(r.unsubscribedAt), r.emailError]
      .map(csvCell)
      .join(","),
  );
  return c.body([head.join(","), ...lines].join("\n") + "\n", 200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="waitlist-${new Date().toISOString().slice(0, 10)}.csv"`,
    "cache-control": "private, no-store",
  });
});

/** "Invite makers": every confirmed maker gets the early-access invite (sent in batches by the cron). */
app.post("/admin/waitlist/invite-makers", async (c) => {
  requireAdmin(c);
  await body(c, z.object({ confirm: z.literal(WAITLIST_INVITE_CONFIRM) }));
  const db = c.get("db");
  await db.update(siteState).set({ makersInvitedAt: sql`coalesce(${siteState.makersInvitedAt}, ${nowSec()})` }).where(eq(siteState.id, 1));
  c.executionCtx.waitUntil(processWaitlistEmails(c.env, db).then((r) => console.log("[waitlist]", JSON.stringify(r))));
  return c.json({ ok: true });
});

/** "Launch": ends the waitlist and pre-launch mode, and sends explorers the launch invite (in batches). */
app.post("/admin/waitlist/launch", async (c) => {
  requireAdmin(c);
  await body(c, z.object({ confirm: z.literal(WAITLIST_LAUNCH_CONFIRM) }));
  const db = c.get("db");
  await db.update(siteState).set({ launchedAt: sql`coalesce(${siteState.launchedAt}, ${nowSec()})` }).where(eq(siteState.id, 1));
  forgetLaunchState(c.env);
  c.executionCtx.waitUntil(
    (async () => {
      await purgeWebPaths(c.env, ["/", "/sitemap.xml", "/makers"]);
      console.log("[waitlist]", JSON.stringify(await processWaitlistEmails(c.env, db)));
    })(),
  );
  return c.json({ ok: true });
});

export default app;
