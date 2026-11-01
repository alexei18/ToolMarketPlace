import { escapeHtml } from "@tm/shared";
import type { Env } from "../env";

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain paragraphs; the first link becomes a button. */
  lines: string[];
  action?: { label: string; url: string };
}

/**
 * Sends a transactional email through Resend when RESEND_API_KEY is set.
 * Without a key (local dev) the message is printed to the console instead.
 */
export async function sendEmail(env: Env, msg: EmailMessage): Promise<void> {
  const html = renderEmail(env.WEB_ORIGIN.replace(/\/$/, ""), msg);
  const text = [...msg.lines, msg.action ? `${msg.action.label}: ${msg.action.url}` : ""].filter(Boolean).join("\n\n");

  if (!env.RESEND_API_KEY) {
    console.log(`[email] to=${msg.to} subject="${msg.subject}"\n${text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [msg.to], subject: msg.subject, html, text }),
  });
  if (!res.ok) {
    console.error("[email] send failed", res.status, await res.text().catch(() => ""));
    throw new Error("Email could not be sent");
  }
}

function renderEmail(web: string, msg: EmailMessage): string {
  const paras = msg.lines.map((l) => `<p style="margin:0 0 16px">${escapeHtml(l)}</p>`).join("");
  const button = msg.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(msg.action.url)}" style="background:#111;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(msg.action.label)}</a></p>
       <p style="margin:0 0 16px;color:#6b6b6b;font-size:13px">Or paste this link: ${escapeHtml(msg.action.url)}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f7f7f5;font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif;color:#111;font-size:15px;line-height:1.5">
<div style="max-width:520px;margin:0 auto;padding:40px 24px">
<img src="${escapeHtml(web)}/brand/tryworthy-wordmark-2x.png" alt="Tryworthy" width="105" height="24" style="display:block;border:0;margin:0 0 24px">
<div style="background:#fff;border:1px solid #e8e8e6;border-radius:8px;padding:24px">${paras}${button}</div>
</div></body></html>`;
}
