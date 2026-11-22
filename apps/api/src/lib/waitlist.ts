import { and, asc, desc, eq, exists, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { categories, productCategories, products, siteState, user, userInterests, waitlist, type Database } from "@tm/db";
import { WAITLIST_INVITE_DAYS, longDate, nowSec } from "@tm/shared";
import { en } from "@tm/shared/copy";
import type { Env } from "../env";
import { EMAIL_BATCH_SIZE, EmailDeferredError, EmailFailedError, sendEmail, sendEmailBatch, type EmailMessage } from "./email";
import { configDate } from "./prelaunch";

export type WaitlistRow = typeof waitlist.$inferSelect;

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

/** A new account takes over its waitlist sign-up's source tags and categories, where it has none yet. */
export async function adoptWaitlistData(db: Database, userId: string, email: string): Promise<void> {
  const row = await db.select().from(waitlist).where(eq(waitlist.email, email.trim().toLowerCase())).get();
  if (!row) return;
  await db
    .update(user)
    .set({ utmSource: sql`coalesce(${user.utmSource}, ${row.utmSource})`, utmCampaign: sql`coalesce(${user.utmCampaign}, ${row.utmCampaign})`, utmContent: sql`coalesce(${user.utmContent}, ${row.utmContent})` })
    .where(eq(user.id, userId));
  const ids = parseInterests(row.interests);
  if (ids.length === 0) return;
  const known = await db.select({ id: categories.id }).from(categories).where(inArray(categories.id, ids)).all();
  if (known.length) await db.insert(userInterests).values(known.map((k) => ({ userId, categoryId: k.id }))).onConflictDoNothing();
}

export function parseInterests(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/* Signed links. A token is "<id>.<expiry in base 36, 0 = never>.<HMAC-SHA256>", keyed per purpose. */

type Purpose = "confirm" | "unsubscribe" | "invite";
const encoder = new TextEncoder();
const hmacKeys = new Map<string, Promise<CryptoKey>>();

function hmacKey(env: Env): Promise<CryptoKey> {
  let key = hmacKeys.get(env.BETTER_AUTH_SECRET);
  if (!key) {
    key = crypto.subtle.importKey("raw", encoder.encode(`waitlist:${env.BETTER_AUTH_SECRET}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    hmacKeys.set(env.BETTER_AUTH_SECRET, key);
  }
  return key;
}

const toB64Url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function fromB64Url(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function signToken(env: Env, purpose: Purpose, id: string, expiresAt: number): Promise<string> {
  const payload = `${id}.${expiresAt.toString(36)}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), encoder.encode(`${purpose}.${payload}`));
  return `${payload}.${toB64Url(sig)}`;
}

export type TokenCheck = { ok: true; id: string } | { ok: false; reason: "invalid" | "expired" };

export async function verifyToken(env: Env, purpose: Purpose, token: string, now = nowSec()): Promise<TokenCheck> {
  const [id, exp36, sig, extra] = token.split(".");
  const sigBytes = sig ? fromB64Url(sig) : null;
  if (!id || !exp36 || !sigBytes || extra !== undefined) return { ok: false, reason: "invalid" };
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(env), sigBytes, encoder.encode(`${purpose}.${id}.${exp36}`));
  if (!valid) return { ok: false, reason: "invalid" };
  const exp = parseInt(exp36, 36);
  if (exp !== 0 && now > exp) return { ok: false, reason: "expired" };
  return { ok: true, id };
}

const web = (env: Env) => env.WEB_ORIGIN.replace(/\/$/, "");
const api = (env: Env) => env.API_ORIGIN.replace(/\/$/, "");

/* Emails (docs/COPY.md "Waitlist"). Each one carries the unsubscribe footer. */

async function unsubscribeLinks(env: Env, row: WaitlistRow): Promise<NonNullable<EmailMessage["unsubscribe"]>> {
  const t = await signToken(env, "unsubscribe", row.id, 0);
  return {
    label: en.waitlist.emails.unsubscribe,
    note: en.waitlist.emails.footer(env.SITE_NAME),
    pageUrl: `${web(env)}/waitlist/unsubscribe?t=${t}`,
    oneClickUrl: `${api(env)}/waitlist/unsubscribe?t=${t}`,
  };
}

/** The thank-you on joining (single opt-in): what happens next and the personal share link. */
export async function welcomeEmail(env: Env, row: WaitlistRow): Promise<EmailMessage> {
  const c = en.waitlist.confirmed;
  const date = (v?: string) => {
    const d = configDate(v);
    return d ? longDate(d) : null;
  };
  const next = row.role === "maker" ? c.maker(date(env.MAKER_ACCESS_DATE)) : row.interests !== "[]" ? c.explorer(date(env.LAUNCH_DATE)) : c.explorerNoCategories(date(env.LAUNCH_DATE));
  return {
    to: row.email,
    subject: en.waitlist.emails.welcome.subject(env.SITE_NAME),
    lines: [c.title, next],
    action: { label: c.shareTitle, url: `${web(env)}/?ref=${row.refCode}` },
    unsubscribe: await unsubscribeLinks(env, row),
  };
}

export async function makerInviteEmail(env: Env, row: WaitlistRow, now = nowSec()): Promise<EmailMessage> {
  const m = en.waitlist.emails.makerInvite;
  const launch = configDate(env.LAUNCH_DATE);
  const t = await signToken(env, "invite", row.id, now + WAITLIST_INVITE_DAYS * 86400);
  return {
    to: row.email,
    subject: m.subject(env.SITE_NAME),
    lines: [m.intro(launch ? longDate(launch) : null), m.live, m.expiry],
    action: { label: m.button, url: `${web(env)}/join?t=${t}` },
    unsubscribe: await unsubscribeLinks(env, row),
  };
}

export interface Pick {
  slug: string;
  title: string;
  tagline: string;
  scoreWeek: number;
}

export async function launchInviteEmail(env: Env, row: WaitlistRow, picks: Pick[], fromCategories: boolean): Promise<EmailMessage> {
  const l = en.waitlist.emails.launch;
  return {
    to: row.email,
    subject: fromCategories ? l.subject : l.subjectNoCategories,
    lines: picks.map((p) => l.item(p.title, p.tagline)),
    action: { label: l.button, url: `${web(env)}/signup` },
    unsubscribe: await unsubscribeLinks(env, row),
  };
}

/* Sending. A quota or rate limit keeps the email for the cron; the visitor never sees it. */

/** Sends the welcome email and records the outcome on the row. */
export async function sendWelcome(env: Env, db: Database, row: WaitlistRow): Promise<void> {
  const now = nowSec();
  try {
    await sendEmail(env, await welcomeEmail(env, row));
    await db.update(waitlist).set({ confirmationSentAt: now, confirmationQueued: false, emailFailedAt: null, emailError: null }).where(eq(waitlist.id, row.id));
  } catch (err) {
    if (err instanceof EmailDeferredError) await db.update(waitlist).set({ confirmationQueued: true }).where(eq(waitlist.id, row.id));
    else if (err instanceof EmailFailedError) await db.update(waitlist).set({ confirmationQueued: false, emailFailedAt: now, emailError: err.message }).where(eq(waitlist.id, row.id));
    else throw err;
  }
}

/** Sends a confirmed maker their early-access invite again (they asked through the form). */
export async function resendMakerInvite(env: Env, db: Database, row: WaitlistRow): Promise<void> {
  const now = nowSec();
  try {
    await sendEmail(env, await makerInviteEmail(env, row, now));
    await db.update(waitlist).set({ confirmationSentAt: now, emailFailedAt: null, emailError: null }).where(eq(waitlist.id, row.id));
  } catch (err) {
    if (err instanceof EmailFailedError) await db.update(waitlist).set({ emailFailedAt: now, emailError: err.message }).where(eq(waitlist.id, row.id));
    else if (!(err instanceof EmailDeferredError)) throw err;
  }
}

/** Email requests one cron run may make (the free plan allows 50 subrequests per invocation). */
const MAX_REQUESTS_PER_RUN = 10;

export interface QueueResult {
  confirmations: number;
  makerInvites: number;
  launchInvites: number;
  failed: number;
  /** Stopped early because of the provider's quota or rate limit. */
  deferred: boolean;
}

/**
 * Works through the waitlist emails, oldest first: confirmations held back by a quota or rate limit,
 * then the maker invites (after the admin's "Invite makers"), then the launch invites (after
 * "Launch"). Each row is marked as soon as its email went out, so a stopped run just continues on
 * the next cron.
 */
export async function processWaitlistEmails(env: Env, db: Database, nowMs = Date.now()): Promise<QueueResult> {
  const now = Math.floor(nowMs / 1000);
  const result: QueueResult = { confirmations: 0, makerInvites: 0, launchInvites: 0, failed: 0, deferred: false };
  let requests = 0;

  const state = await db.select().from(siteState).where(eq(siteState.id, 1)).get();
  let picks: Awaited<ReturnType<typeof loadLaunchPicks>> | null = null;

  const jobs: { key: "confirmations" | "makerInvites" | "launchInvites"; load: () => Promise<WaitlistRow[]>; build: (r: WaitlistRow) => Promise<EmailMessage>; sent: (ids: string[]) => Promise<unknown> }[] = [
    {
      // The welcome email, still stored in the confirmation_* columns of the double opt-in era.
      key: "confirmations",
      load: () => db.select().from(waitlist).where(eq(waitlist.confirmationQueued, true)).orderBy(asc(waitlist.createdAt)).limit(EMAIL_BATCH_SIZE).all(),
      build: (r) => welcomeEmail(env, r),
      sent: (ids) => db.update(waitlist).set({ confirmationSentAt: now, confirmationQueued: false, emailFailedAt: null, emailError: null }).where(inArray(waitlist.id, ids)),
    },
  ];
  const invitable = (role: "maker" | "explorer") => () =>
    db
      .select()
      .from(waitlist)
      .where(and(eq(waitlist.role, role), isNotNull(waitlist.confirmedAt), isNull(waitlist.unsubscribedAt), isNull(waitlist.invitedAt), isNull(waitlist.emailFailedAt)))
      .orderBy(asc(waitlist.confirmedAt))
      .limit(EMAIL_BATCH_SIZE)
      .all();
  const markInvited = (ids: string[]) => db.update(waitlist).set({ invitedAt: now }).where(inArray(waitlist.id, ids));
  if (state?.makersInvitedAt) jobs.push({ key: "makerInvites", load: invitable("maker"), build: (r) => makerInviteEmail(env, r, now), sent: markInvited });
  if (state?.launchedAt) {
    jobs.push({
      key: "launchInvites",
      load: invitable("explorer"),
      build: async (r) => {
        picks ??= await loadLaunchPicks(db);
        const chosen = picksFor(picks, parseInterests(r.interests));
        return launchInviteEmail(env, r, chosen.items, chosen.fromCategories);
      },
      sent: markInvited,
    });
  }

  for (const job of jobs) {
    while (requests < MAX_REQUESTS_PER_RUN) {
      const rows = await job.load();
      if (rows.length === 0) break;
      const msgs = await Promise.all(rows.map((r) => job.build(r)));
      requests++;
      try {
        await sendEmailBatch(env, msgs);
        await job.sent(rows.map((r) => r.id));
        result[job.key] += rows.length;
        continue;
      } catch (err) {
        if (err instanceof EmailDeferredError) return { ...result, deferred: true };
        if (!(err instanceof EmailFailedError)) throw err;
      }
      // A batch is all or nothing: one bad address refuses it. Send one by one to find it.
      for (let i = 0; i < rows.length; i++) {
        if (requests >= MAX_REQUESTS_PER_RUN) return result;
        requests++;
        try {
          await sendEmail(env, msgs[i]!);
          await job.sent([rows[i]!.id]);
          result[job.key]++;
        } catch (err) {
          if (err instanceof EmailDeferredError) return { ...result, deferred: true };
          if (!(err instanceof EmailFailedError)) throw err;
          await db.update(waitlist).set({ confirmationQueued: false, emailFailedAt: now, emailError: err.message }).where(eq(waitlist.id, rows[i]!.id));
          result.failed++;
        }
      }
    }
  }
  return result;
}

/** The launch email lists this many products. */
const LAUNCH_PICKS = 5;

/** Top this week overall and per category: live products that meet the quality conditions. */
async function loadLaunchPicks(db: Database): Promise<{ overall: Pick[]; byCategory: Map<string, Pick[]> }> {
  const cats = await db.select({ id: categories.id }).from(categories).all();
  const fields = { slug: products.slug, title: products.title, tagline: products.tagline, scoreWeek: products.scoreWeek };
  const base = and(eq(products.status, "live"), eq(products.qualityOk, true));
  const order = [desc(products.scoreWeek), desc(products.publishedAt)] as const;
  const overall = db.select(fields).from(products).where(base).orderBy(...order).limit(LAUNCH_PICKS);
  const perCat = cats.map((c) =>
    db
      .select(fields)
      .from(products)
      .where(and(base, exists(db.select({ x: sql`1` }).from(productCategories).where(and(eq(productCategories.productId, products.id), eq(productCategories.categoryId, c.id))))))
      .orderBy(...order)
      .limit(LAUNCH_PICKS),
  );
  const [top, ...lists] = await db.batch([overall, ...perCat]);
  return { overall: top, byCategory: new Map(cats.map((c, i) => [c.id, lists[i]!])) };
}

/** The best products across the person's categories; this week's overall top when they picked none or nothing is there yet. */
export function picksFor(picks: { overall: Pick[]; byCategory: Map<string, Pick[]> }, interests: string[]): { items: Pick[]; fromCategories: boolean } {
  const seen = new Set<string>();
  const merged = interests
    .flatMap((id) => picks.byCategory.get(id) ?? [])
    .filter((p) => !seen.has(p.slug) && seen.add(p.slug))
    .sort((a, b) => b.scoreWeek - a.scoreWeek)
    .slice(0, LAUNCH_PICKS);
  return merged.length ? { items: merged, fromCategories: true } : { items: picks.overall, fromCategories: false };
}

/** Share codes: 8 characters without look-alikes. */
const REF_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export function newRefCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("");
}
