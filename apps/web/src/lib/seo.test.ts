import { describe, expect, test } from "bun:test";
import { DESCRIPTION_MAX, TITLE_MAX, categorySeo, clip, homeSeo, makerSeo, midSentence, newSeo, productSeo, weekSeo, withSite } from "./seo";

describe("clip", () => {
  test("keeps short text and cuts long text on a word boundary", () => {
    expect(clip("  Short   text ", 60)).toBe("Short text");
    expect(clip("Invoices that chase late payments for you, every single week", 30)).toBe("Invoices that chase late…");
    expect(clip("one two, three four", 12)).toBe("one two…");
  });
  test("cuts a single overlong word instead of dropping it", () => {
    expect(clip("Supercalifragilisticexpialidocious", 10)).toBe("Supercali…");
  });
});

describe("templates", () => {
  test("titles keep the site name and stay within 60 characters", () => {
    expect(homeSeo("Tryworthy").title).toBe("New Apps & AI Tools Worth Trying · Tryworthy");
    expect(categorySeo("Productivity", "Tryworthy")).toEqual({
      title: "Best New Productivity Apps This Week · Tryworthy",
      description: "New productivity apps and AI tools, ranked by what real people save and try. Updated daily, with free trials and perks.",
    });
    const long = withSite("A product name that goes on: and a tagline that is far too long", "Tryworthy");
    expect(long.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(long.endsWith("… · Tryworthy")).toBe(true);
    const maker = makerSeo("Maria-Magdalena Ionescu-Constantinescu de la Vrancea", "Tryworthy");
    expect(maker.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(maker.title.endsWith(" — Products on Tryworthy")).toBe(true);
  });

  test("/new and weekly archive templates", () => {
    expect(newSeo("Tryworthy").title).toBe("New Apps & AI Tools This Week · Tryworthy");
    expect(weekSeo("Sales & CRM", 44, 2026, "Tryworthy")).toEqual({
      title: "Best New Sales & CRM Apps, Week 44 2026 · Tryworthy",
      description: "The new sales & CRM apps and AI tools launched in week 44 of 2026, ranked by what real people saved and tried.",
    });
    for (const seo of [newSeo("Tryworthy"), weekSeo("Developer Tools and Infrastructure", 44, 2026, "Tryworthy")]) {
      expect(seo.title.length).toBeLessThanOrEqual(TITLE_MAX);
      expect(seo.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    }
  });

  test("category names read mid-sentence", () => {
    expect(midSentence("Sales & CRM")).toBe("sales & CRM");
    expect(midSentence("AI")).toBe("AI");
    expect(midSentence("Health & Fitness")).toBe("health & fitness");
  });

  test("product description: short description, then the perk sentence, within 155 characters", () => {
    const seo = productSeo(
      {
        title: "Ledgerly",
        tagline: "Invoices that chase late payments for you",
        description: "Ledgerly sends **polite reminders** before and after an invoice is due, so you stop writing awkward follow-up emails to every client.",
        perks: [{ title: "60 days free", available: true }],
      },
      "Tryworthy",
    );
    expect(seo.title).toBe("Ledgerly: Invoices that chase late payments… · Tryworthy");
    expect(seo.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(seo.description).toStartWith("Ledgerly sends polite reminders");
    expect(seo.description).toEndWith("60 days free on Tryworthy.");
  });

  test("product description ends on a sentence and keeps the whole perk sentence", () => {
    const seo = productSeo(
      {
        title: "Ledgerly",
        tagline: "Invoices that chase late payments for you",
        description: ["Ledgerly sends polite reminders before and after an invoice is due, so you stop writing awkward follow-up emails.", "", "## What you get", "- Branded invoices in under a minute"].join("\n"),
        perks: [{ title: "3 months of Pro, free", available: true }],
      },
      "Tryworthy",
    );
    expect(seo.description).toBe(
      "Ledgerly sends polite reminders before and after an invoice is due, so you stop writing awkward follow-up emails. 3 months of Pro, free on Tryworthy.",
    );
  });
});
