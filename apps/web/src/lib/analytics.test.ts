import { describe, expect, test } from "bun:test";
import { redactSecrets } from "./analytics";

describe("redactSecrets", () => {
  test("hides one-time tokens in every URL of an event, keeps other params", () => {
    const event = {
      event: "$pageview",
      properties: {
        $current_url: "https://tryworthy.app/waitlist/confirm?t=abc123&utm_source=tiktok",
        $referrer: "https://tryworthy.app/reset-password?token=xyz#top",
        $elements: [{ attr__href: "/join?t=secret" }],
        count: 3,
      },
    };
    expect(redactSecrets(event)).toEqual({
      event: "$pageview",
      properties: {
        $current_url: "https://tryworthy.app/waitlist/confirm?t=redacted&utm_source=tiktok",
        $referrer: "https://tryworthy.app/reset-password?token=redacted#top",
        $elements: [{ attr__href: "/join?t=redacted" }],
        count: 3,
      },
    });
  });

  test("keeps the Date timestamp (PostHog rejects the batch without it)", () => {
    const timestamp = new Date("2026-11-22T12:00:00Z");
    expect(redactSecrets({ event: "$pageview", timestamp }).timestamp).toBe(timestamp);
  });

  test("leaves look-alike params alone", () => {
    expect(redactSecrets("/?utm_content=t1&h=b&tab=new")).toBe("/?utm_content=t1&h=b&tab=new");
  });
});
