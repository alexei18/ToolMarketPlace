import { describe, expect, test } from "bun:test";
import { isOpenDuringWaitlist, waitlistLocation } from "./waitlist";

describe("waitlist redirects", () => {
  test("legal pages, /ranking, /about, /makers and sign-in stay open; catalog pages don't", () => {
    for (const p of ["/", "/privacy", "/terms", "/terms/makers", "/cookies", "/guidelines", "/report", "/legal", "/ranking", "/about", "/makers/", "/login", "/reset-password"]) {
      expect(isOpenDuringWaitlist(p)).toBe(true);
    }
    for (const p of ["/dashboard", "/dashboard/p/abc", "/admin", "/admin/waitlist", "/waitlist/confirm", "/join", "/robots.txt", "/sitemap.xml", "/sitemaps/pages.xml", "/brand/tryworthy-wordmark.svg"]) {
      expect(isOpenDuringWaitlist(p)).toBe(true);
    }
    for (const p of ["/top", "/trending", "/new", "/perks", "/search", "/c/design", "/p/some-app", "/m/maker", "/signup", "/feed", "/settings", "/dashboards", "/joined", "/administrator"]) {
      expect(isOpenDuringWaitlist(p)).toBe(false);
    }
  });

  test("the redirect keeps the campaign tags and the share code, nothing else", () => {
    expect(waitlistLocation(new URL("https://x.test/top?utm_source=tiktok&utm_campaign=b01&ref=abc123&sort=new"))).toBe("/?utm_source=tiktok&utm_campaign=b01&ref=abc123");
    expect(waitlistLocation(new URL("https://x.test/c/design?page=2"))).toBe("/");
  });
});
