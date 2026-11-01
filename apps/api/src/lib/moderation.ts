/*
 * Moderation decisions (statements of reasons, docs/LEGAL.md): every restriction of a product or an
 * account is recorded with what, why, which rule and whether it was automated, the affected user is
 * told how to contest it, and reporters hear the outcome.
 */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { moderationDecisions, products, reports, session, user, type Database } from "@tm/db";
import {
  CONTEST_WINDOW_MONTHS,
  MODERATION_RULES,
  RULE_FOR_REPORT_REASON,
  addMonths,
  newId,
  nowSec,
  reportReference,
  type DecisionDTO,
  type DecisionTrigger,
  type ModerationRule,
  type ReportReason,
} from "@tm/shared";
import { en } from "@tm/shared/copy";
import type { Env } from "../env";
import { productPaths, purgeWebPaths } from "./cache";
import { sendEmail } from "./email";
import { createNotifications } from "./notify";

export type Decision = typeof moderationDecisions.$inferSelect;
type Product = Pick<typeof products.$inferSelect, "id" | "slug" | "title" | "makerId">;

const web = (env: Env) => env.WEB_ORIGIN.replace(/\/$/, "");
/** Where the affected user reads and contests a decision. */
export const decisionPath = (d: Pick<Decision, "id" | "targetType" | "parentId">) => (d.targetType === "account" || d.parentId ? "/suspended" : `/dashboard/decisions#d-${d.id}`);

/** The last moment a decision can be contested, or null when it can't be. */
export function contestUntil(d: Decision, now = nowSec()): number | null {
  if (d.contestedAt || d.reversedAt || d.parentId) return null;
  const until = addMonths(d.createdAt, CONTEST_WINDOW_MONTHS);
  return until > now ? until : null;
}

export function decisionDto(d: Decision, product: { id: string; slug: string; title: string } | null): DecisionDTO {
  return {
    id: d.id,
    targetType: d.targetType,
    action: d.action,
    trigger: d.trigger,
    automated: d.automated,
    rule: d.rule,
    facts: d.facts,
    createdAt: d.createdAt,
    reversedAt: d.reversedAt,
    product,
    parentId: d.parentId,
    contest: d.contestedAt
      ? { body: d.contestBody ?? "", contestedAt: d.contestedAt, outcome: d.contestOutcome, response: d.contestResponse, resolvedAt: d.contestResolvedAt }
      : null,
    contestUntil: contestUntil(d),
  };
}

/** The statement of reasons as plain lines (notification body and email). */
export function statementLines(env: Env, d: Decision, productTitle: string | null, hiddenProducts = 0): string[] {
  const m = en.moderation;
  const rule = MODERATION_RULES[d.rule];
  const what = d.action === "suspended" ? m.what.suspended : m.what[d.action](productTitle ?? "");
  return [
    what,
    ...(d.action === "suspended" && hiddenProducts > 0 ? [m.productsHidden(hiddenProducts)] : []),
    d.facts,
    m.rule(rule.label, `${web(env)}${rule.href}`),
    d.automated ? m.automated : m.manual,
    m.contestHow(CONTEST_WINDOW_MONTHS, `${web(env)}${decisionPath(d)}`),
  ];
}

async function tellUser(env: Env, db: Database, userId: string, title: string, lines: string[], href: string): Promise<void> {
  await createNotifications(db, [{ userId, type: "system", payload: { kind: "system", title, body: lines.join("\n"), href } }]);
  const to = await db.select({ email: user.email }).from(user).where(eq(user.id, userId)).get();
  if (to) await sendEmail(env, { to: to.email, subject: `${env.SITE_NAME}: ${title}`, lines, action: { label: "Open", url: `${web(env)}${href}` } }).catch((err) => console.error("[moderation] email failed", err));
}

interface NewDecision {
  targetType: Decision["targetType"];
  productId?: string | null;
  userId: string;
  parentId?: string | null;
  action: Decision["action"];
  trigger: DecisionTrigger;
  automated: boolean;
  rule: ModerationRule;
  facts: string;
  decidedBy?: string | null;
}

function decisionRow(input: NewDecision, now: number): Decision {
  return {
    id: newId(),
    targetType: input.targetType,
    productId: input.productId ?? null,
    userId: input.userId,
    parentId: input.parentId ?? null,
    action: input.action,
    trigger: input.trigger,
    automated: input.automated,
    rule: input.rule,
    facts: input.facts,
    decidedBy: input.decidedBy ?? null,
    createdAt: now,
    reversedAt: null,
    reversedBy: null,
    contestBody: null,
    contestedAt: null,
    contestOutcome: null,
    contestResponse: null,
    contestResolvedAt: null,
    contestResolvedBy: null,
  };
}

/** Records a product decision and sends the maker the statement of reasons. */
export async function recordProductDecision(env: Env, db: Database, product: Product, input: Omit<NewDecision, "targetType" | "productId" | "userId">): Promise<Decision> {
  const d = decisionRow({ ...input, targetType: "product", productId: product.id, userId: product.makerId }, nowSec());
  await db.insert(moderationDecisions).values(d);
  await tellUser(env, db, product.makerId, en.moderation.titles.product, statementLines(env, d, product.title), decisionPath(d));
  return d;
}

/** Statement for a product hidden automatically after counted reports. */
export async function recordAutoHide(env: Env, db: Database, product: Product): Promise<Decision> {
  const open = await db
    .select({ reason: reports.reason })
    .from(reports)
    .where(and(eq(reports.productId, product.id), eq(reports.counts, true), isNull(reports.outcome)))
    .all();
  const tally = new Map<ReportReason, number>();
  for (const r of open) tally.set(r.reason, (tally.get(r.reason) ?? 0) + 1);
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0]?.[0] ?? "other";
  const reasons = ranked.map(([r]) => en.reportReasons[r]).join(", ");
  return recordProductDecision(env, db, product, { action: "hidden", trigger: "reports", automated: true, rule: RULE_FOR_REPORT_REASON[top], facts: en.moderation.autoHideFacts(open.length, reasons) });
}

/** Marks the product's open reports decided and tells each reporter the outcome (members by notification, public reporters by email). */
export async function decideReports(env: Env, db: Database, product: Pick<Product, "id" | "title">, outcome: "upheld" | "rejected", decision: Decision | null): Promise<void> {
  const open = await db
    .select({ id: reports.id, reporterId: reports.reporterId, email: reports.reporterEmail })
    .from(reports)
    .where(and(eq(reports.productId, product.id), isNull(reports.outcome)))
    .all();
  if (open.length === 0) return;
  await db
    .update(reports)
    .set({ outcome, decidedAt: nowSec(), decisionId: decision?.id ?? null })
    .where(and(eq(reports.productId, product.id), isNull(reports.outcome)));

  const m = en.moderation.reportOutcome;
  const body =
    outcome === "upheld" && decision
      ? m.upheld(product.title, decision.action, MODERATION_RULES[decision.rule].label)
      : m.rejected(product.title);
  const members = open.filter((r) => r.reporterId);
  await createNotifications(
    db,
    members.map((r) => ({ userId: r.reporterId!, type: "system" as const, payload: { kind: "system" as const, title: m.title(product.title), body } })),
  );
  for (const r of open) {
    if (!r.email) continue;
    await sendEmail(env, { to: r.email, subject: `${env.SITE_NAME}: ${m.title(product.title)}`, lines: [body, `Reference: ${reportReference(r.id)}`] }).catch((err) =>
      console.error("[moderation] reporter email failed", err),
    );
  }
}

/** Removes a product (admin review) with a statement of reasons; upholds its open reports. */
export async function removeProduct(env: Env, db: Database, product: Product, input: { rule: ModerationRule; facts: string; adminId: string }): Promise<Decision> {
  await db.update(products).set({ status: "removed", updatedAt: nowSec() }).where(eq(products.id, product.id));
  const d = await recordProductDecision(env, db, product, { action: "removed", trigger: "admin", automated: false, rule: input.rule, facts: input.facts, decidedBy: input.adminId });
  await decideReports(env, db, product, "upheld", d);
  return d;
}

/** Marks a product's standing decisions reversed and tells the maker. Returns true when one was reversed. */
async function reverseProductDecisions(env: Env, db: Database, product: Product, by: string | null): Promise<boolean> {
  const done = await db
    .update(moderationDecisions)
    .set({ reversedAt: nowSec(), reversedBy: by })
    .where(and(eq(moderationDecisions.productId, product.id), isNull(moderationDecisions.reversedAt)))
    .returning({ id: moderationDecisions.id });
  if (done.length) await tellUser(env, db, product.makerId, en.moderation.titles.reversed, [en.moderation.restored(product.title)], `/dashboard/decisions`);
  return done.length > 0;
}

/** Puts a hidden or removed product back live (admin restore or a reversed contest). */
export async function restoreProduct(env: Env, db: Database, product: Product, by: string | null): Promise<void> {
  await db.update(products).set({ status: "live", validReportCount: 0, updatedAt: nowSec() }).where(eq(products.id, product.id));
  await reverseProductDecisions(env, db, product, by);
}

/**
 * Suspends an account: blocks everything but the suspension page, ends its sessions and hides its
 * live products. One account decision, plus one per hidden product pointing at it. Returns null when
 * the account was already suspended.
 */
export async function suspendAccount(
  env: Env,
  db: Database,
  userId: string,
  input: { rule: ModerationRule; facts: string; trigger: DecisionTrigger; automated: boolean; adminId?: string | null },
): Promise<Decision | null> {
  const now = nowSec();
  const banned = await db
    .update(user)
    .set({ bannedAt: now })
    .where(and(eq(user.id, userId), isNull(user.bannedAt)))
    .returning({ id: user.id });
  if (!banned.length) return null;
  const live = await db
    .select({ id: products.id, slug: products.slug, title: products.title, makerId: products.makerId })
    .from(products)
    .where(and(eq(products.makerId, userId), eq(products.status, "live")))
    .all();
  const account = decisionRow({ targetType: "account", userId, action: "suspended", trigger: input.trigger, automated: input.automated, rule: input.rule, facts: input.facts, decidedBy: input.adminId }, now);
  const children = live.map((p) =>
    decisionRow(
      { targetType: "product", productId: p.id, userId, parentId: account.id, action: "hidden", trigger: "suspension", automated: input.automated, rule: input.rule, facts: en.moderation.hiddenBySuspension, decidedBy: input.adminId },
      now,
    ),
  );
  await db.batch([
    db.delete(session).where(eq(session.userId, userId)),
    db.update(products).set({ status: "hidden", updatedAt: now }).where(and(eq(products.makerId, userId), eq(products.status, "live"))),
    db.insert(moderationDecisions).values(account),
    ...children.map((c) => db.insert(moderationDecisions).values(c)),
  ]);
  await tellUser(env, db, userId, en.moderation.titles.account, statementLines(env, account, null, live.length), decisionPath(account));
  if (live.length) await purgeWebPaths(env, live.flatMap((p) => productPaths(p.slug)));
  return account;
}

/** Lifts a suspension (admin unban or a reversed contest): products hidden by it go live again. */
export async function unsuspendAccount(env: Env, db: Database, userId: string, by: string | null): Promise<void> {
  const now = nowSec();
  const open = await db
    .select({ id: moderationDecisions.id })
    .from(moderationDecisions)
    .where(and(eq(moderationDecisions.userId, userId), eq(moderationDecisions.targetType, "account"), isNull(moderationDecisions.reversedAt)))
    .all();
  const ids = open.map((d) => d.id);
  const children = ids.length
    ? await db
        .select({ id: moderationDecisions.id, productId: moderationDecisions.productId })
        .from(moderationDecisions)
        .where(and(inArray(moderationDecisions.parentId, ids), isNull(moderationDecisions.reversedAt)))
        .all()
    : [];
  const productIds = children.map((c) => c.productId).filter((id): id is string => !!id);
  const restored = productIds.length
    ? await db
        .update(products)
        .set({ status: "live", updatedAt: now })
        .where(and(inArray(products.id, productIds.slice(0, 90)), eq(products.status, "hidden")))
        .returning({ slug: products.slug })
    : [];
  await db.batch([
    db.update(user).set({ bannedAt: null }).where(eq(user.id, userId)),
    db
      .update(moderationDecisions)
      .set({ reversedAt: now, reversedBy: by })
      .where(and(eq(moderationDecisions.userId, userId), isNull(moderationDecisions.reversedAt), sql`(${moderationDecisions.targetType} = 'account' OR ${moderationDecisions.trigger} = 'suspension')`)),
  ]);
  if (ids.length) await tellUser(env, db, userId, en.moderation.titles.reversed, [en.moderation.unsuspended], "/dashboard/decisions");
  if (restored.length) await purgeWebPaths(env, restored.flatMap((p) => productPaths(p.slug)));
}

/** The affected user contests a decision: once, within the window, not for products covered by a suspension. */
export async function contestDecision(db: Database, userId: string, decisionId: string, body: string): Promise<"not_found" | "closed" | Decision> {
  const d = await db
    .select()
    .from(moderationDecisions)
    .where(and(eq(moderationDecisions.id, decisionId), eq(moderationDecisions.userId, userId)))
    .get();
  if (!d) return "not_found";
  if (!contestUntil(d)) return "closed";
  const done = await db
    .update(moderationDecisions)
    .set({ contestBody: body, contestedAt: nowSec() })
    .where(and(eq(moderationDecisions.id, d.id), isNull(moderationDecisions.contestedAt)))
    .returning();
  return done[0] ?? "closed";
}

/** An admin answers a contest. "reversed" restores the product or lifts the suspension. */
export async function resolveContest(env: Env, db: Database, d: Decision, adminId: string, input: { outcome: "upheld" | "reversed"; response: string }): Promise<void> {
  await db
    .update(moderationDecisions)
    .set({ contestOutcome: input.outcome, contestResponse: input.response, contestResolvedAt: nowSec(), contestResolvedBy: adminId })
    .where(eq(moderationDecisions.id, d.id));
  if (input.outcome === "reversed") {
    if (d.targetType === "account" && d.userId) await unsuspendAccount(env, db, d.userId, adminId);
    if (d.targetType === "product" && d.productId) {
      const p = await db.select({ id: products.id, slug: products.slug, title: products.title, makerId: products.makerId }).from(products).where(eq(products.id, d.productId)).get();
      if (p) {
        await restoreProduct(env, db, p, adminId);
        await purgeWebPaths(env, productPaths(p.slug));
      }
    }
  }
  if (d.userId) {
    const lines = [en.moderation.contestOutcome[input.outcome], input.response];
    await tellUser(env, db, d.userId, en.moderation.titles.contest, lines, d.targetType === "account" && input.outcome === "upheld" ? "/suspended" : "/dashboard/decisions");
  }
}

/** Decisions about a user, newest first, with their products. */
export async function decisionsFor(db: Database, userId: string): Promise<DecisionDTO[]> {
  const rows = await db
    .select({ d: moderationDecisions, product: { id: products.id, slug: products.slug, title: products.title } })
    .from(moderationDecisions)
    .leftJoin(products, eq(products.id, moderationDecisions.productId))
    .where(eq(moderationDecisions.userId, userId))
    .orderBy(desc(moderationDecisions.createdAt), desc(moderationDecisions.id))
    .limit(200)
    .all();
  return rows.map((r) => decisionDto(r.d, r.product));
}
