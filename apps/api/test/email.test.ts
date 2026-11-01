import { describe, expect, test } from "bun:test";
import { EMAIL_BATCH_SIZE, EmailDeferredError, EmailFailedError, sendEmail, sendEmailBatch, type EmailMessage } from "../src/lib/email";
import { mockFetch, setup } from "./helpers";

const msg = (to = "a@example.com"): EmailMessage => ({
  to,
  subject: "Hello",
  lines: ["Line one"],
  action: { label: "Open", url: "https://tryworthy.app/x" },
  unsubscribe: { label: "Unsubscribe", pageUrl: "https://tryworthy.app/waitlist/unsubscribe?t=abc", oneClickUrl: "https://api.tryworthy.app/waitlist/unsubscribe?t=abc" },
});

const usage = (t: ReturnType<typeof setup>) => t.sqlite.query("SELECT sent, deferred, failed FROM email_usage").get() as { sent: number; deferred: number; failed: number } | null;

describe("email sending", () => {
  test("a sent email is counted for the day and carries the unsubscribe link and one-click headers", async () => {
    const t = setup({ RESEND_API_KEY: "re_test", EMAIL_FROM: "Tryworthy <hello@tryworthy.app>" });
    let body: any = null;
    const restore = mockFetch(async (url, init) => {
      if (url.href === "https://api.resend.com/emails") {
        body = JSON.parse(String(init?.body));
        return Response.json({ id: "1" });
      }
    });
    try {
      await sendEmail(t.env, msg());
    } finally {
      restore();
    }
    expect(body.headers).toEqual({ "List-Unsubscribe": "<https://api.tryworthy.app/waitlist/unsubscribe?t=abc>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect(body.html).toContain("tryworthy-wordmark-2x.png");
    expect(body.html).toContain("https://tryworthy.app/waitlist/unsubscribe?t=abc");
    expect(body.text).toContain("Unsubscribe: https://tryworthy.app/waitlist/unsubscribe?t=abc");
    expect(usage(t)).toEqual({ sent: 1, deferred: 0, failed: 0 });
  });

  test("quota, rate limit and provider errors defer; other refusals fail; both are counted", async () => {
    const t = setup({ RESEND_API_KEY: "re_test" });
    let reply = new Response(JSON.stringify({ statusCode: 429, name: "daily_quota_exceeded", message: "You have exceeded your daily email sending quota." }), { status: 429 });
    const restore = mockFetch(async () => reply.clone());
    try {
      await expect(sendEmailBatch(t.env, [msg("a@example.com"), msg("b@example.com")])).rejects.toBeInstanceOf(EmailDeferredError);
      reply = new Response("oops", { status: 503 });
      await expect(sendEmail(t.env, msg())).rejects.toBeInstanceOf(EmailDeferredError);
      reply = new Response(JSON.stringify({ name: "validation_error", message: "Invalid `to` field." }), { status: 422 });
      await expect(sendEmail(t.env, msg())).rejects.toBeInstanceOf(EmailFailedError);
    } finally {
      restore();
    }
    expect(usage(t)).toEqual({ sent: 0, deferred: 3, failed: 1 });
  });

  test("a batch is capped", async () => {
    const t = setup();
    const many = Array.from({ length: EMAIL_BATCH_SIZE + 1 }, (_, i) => msg(`u${i}@example.com`));
    await expect(sendEmailBatch(t.env, many)).rejects.toThrow();
    await sendEmailBatch(t.env, many.slice(0, 2));
    expect(usage(t)?.sent).toBe(2);
  });
});
