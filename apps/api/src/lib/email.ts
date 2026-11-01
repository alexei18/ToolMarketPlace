import { escapeHtml } from "@tm/shared";
import type { Env } from "../env";

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain paragraphs; the first link becomes a button. */
  lines: string[];
  action?: { label: string; url: string };
  /**
   * Bulk and marketing-style emails: a footer link to the unsubscribe page, plus the one-click
   * List-Unsubscribe headers (RFC 8058) that mail apps show next to the sender.
   */
  unsubscribe?: { label: string; pageUrl: string; oneClickUrl: string };
}

/** Most emails one batch request carries. Kept small so a nearly used daily quota still lets some through. */
export const EMAIL_BATCH_SIZE = 25;

/** The provider refused for now (quota, rate limit or an outage): send it again later. */
export class EmailDeferredError extends Error {}

/** The provider refused for good (bad address, rejected content…). */
export class EmailFailedError extends Error {}

/**
 * Sends a transactional email through Resend when RESEND_API_KEY is set.
 * Without a key (local dev) the message is printed to the console instead.
 * Throws EmailDeferredError or EmailFailedError when it is not sent.
 */
export async function sendEmail(env: Env, msg: EmailMessage): Promise<void> {
  await deliver(env, [msg], "https://api.resend.com/emails");
}

/** Sends up to EMAIL_BATCH_SIZE emails in one request; all of them are sent, or none. */
export async function sendEmailBatch(env: Env, msgs: EmailMessage[]): Promise<void> {
  if (msgs.length === 0) return;
  if (msgs.length > EMAIL_BATCH_SIZE) throw new Error(`At most ${EMAIL_BATCH_SIZE} emails per batch`);
  await deliver(env, msgs, "https://api.resend.com/emails/batch");
}

async function deliver(env: Env, msgs: EmailMessage[], endpoint: string): Promise<void> {
  const web = env.WEB_ORIGIN.replace(/\/$/, "");
  const payload = msgs.map((m) => ({
    from: env.EMAIL_FROM,
    to: [m.to],
    subject: m.subject,
    html: renderEmail(web, m),
    text: renderText(m),
    ...(m.unsubscribe ? { headers: { "List-Unsubscribe": `<${m.unsubscribe.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
  }));

  if (!env.RESEND_API_KEY) {
    for (const p of payload) console.log(`[email] to=${p.to[0]} subject="${p.subject}"\n${p.text}`);
    await countEmails(env, "sent", msgs.length);
    return;
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload.length === 1 && !endpoint.endsWith("/batch") ? payload[0] : payload),
    });
  } catch (err) {
    console.error("[email] provider unreachable", err);
    await countEmails(env, "deferred", msgs.length);
    throw new EmailDeferredError("Email provider unreachable");
  }
  if (res.ok) {
    await countEmails(env, "sent", msgs.length);
    return;
  }
  const body = await res.text().catch(() => "");
  // 429: daily or monthly quota, or the per-second rate limit. 5xx: the provider's own trouble.
  if (res.status === 429 || res.status >= 500) {
    console.warn("[email] deferred", res.status, body);
    await countEmails(env, "deferred", msgs.length);
    throw new EmailDeferredError(errorName(body) ?? `HTTP ${res.status}`);
  }
  console.error("[email] send failed", res.status, body);
  await countEmails(env, "failed", msgs.length);
  throw new EmailFailedError(errorName(body) ?? `HTTP ${res.status}`);
}

/** Resend's error type, e.g. "daily_quota_exceeded" or "validation_error". */
function errorName(body: string): string | null {
  try {
    const json = JSON.parse(body) as { name?: unknown; message?: unknown };
    const name = typeof json.name === "string" ? json.name : null;
    const message = typeof json.message === "string" ? json.message : null;
    return [name, message].filter(Boolean).join(": ").slice(0, 300) || null;
  } catch {
    return null;
  }
}

/** Adds to today's email_usage row. A counting error never stops an email. */
async function countEmails(env: Env, column: "sent" | "deferred" | "failed", n: number): Promise<void> {
  const day = Math.floor(Date.now() / 86_400_000);
  try {
    await env.DB.prepare(`INSERT INTO email_usage (day, ${column}) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET ${column} = ${column} + excluded.${column}`)
      .bind(day, n)
      .run();
  } catch (err) {
    console.error("[email] usage count failed", err);
  }
}

function renderText(msg: EmailMessage): string {
  return [...msg.lines, msg.action ? `${msg.action.label}: ${msg.action.url}` : "", msg.unsubscribe ? `${msg.unsubscribe.label}: ${msg.unsubscribe.pageUrl}` : ""].filter(Boolean).join("\n\n");
}

function renderEmail(web: string, msg: EmailMessage): string {
  const paras = msg.lines.map((l) => `<p style="margin:0 0 16px">${escapeHtml(l)}</p>`).join("");
  const button = msg.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(msg.action.url)}" style="background:#111;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(msg.action.label)}</a></p>
       <p style="margin:0 0 16px;color:#6b6b6b;font-size:13px">Or paste this link: ${escapeHtml(msg.action.url)}</p>`
    : "";
  const footer = msg.unsubscribe
    ? `<p style="margin:16px 0 0;color:#6b6b6b;font-size:13px;text-align:center"><a href="${escapeHtml(msg.unsubscribe.pageUrl)}" style="color:#6b6b6b">${escapeHtml(msg.unsubscribe.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f7f7f5;font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif;color:#111;font-size:15px;line-height:1.5">
<div style="max-width:520px;margin:0 auto;padding:40px 24px">
<img src="${escapeHtml(web)}/brand/tryworthy-wordmark-2x.png" alt="Tryworthy" width="105" height="24" style="display:block;border:0;margin:0 0 24px">
<div style="background:#fff;border:1px solid #e8e8e6;border-radius:8px;padding:24px">${paras}${button}</div>${footer}
</div></body></html>`;
}
