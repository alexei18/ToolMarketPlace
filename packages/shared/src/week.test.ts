import { describe, expect, test } from "bun:test";
import { isoWeek, parseWeek, weekIndex, weekStart } from "./week";

const at = (iso: string) => Date.parse(iso) / 1000;

describe("ISO weeks", () => {
  test("weeks run Monday 00:00 to Sunday 23:59 UTC", () => {
    const w = weekIndex(at("2026-10-30T12:00:00Z"));
    expect(weekStart(w)).toBe(at("2026-10-26T00:00:00Z"));
    expect(weekIndex(at("2026-10-26T00:00:00Z"))).toBe(w);
    expect(weekIndex(at("2026-11-01T23:59:59Z"))).toBe(w);
    expect(weekIndex(at("2026-11-02T00:00:00Z"))).toBe(w + 1);
  });

  test("year and week number follow ISO 8601", () => {
    expect(isoWeek(weekIndex(at("2026-10-30T00:00:00Z"))).slug).toBe("2026-44");
    // 2025-12-29 is in week 1 of 2026 (its Thursday is Jan 1, 2026).
    expect(isoWeek(weekIndex(at("2025-12-29T00:00:00Z")))).toMatchObject({ year: 2026, week: 1, slug: "2026-01" });
    // 2027-01-01 is a Friday, so it still belongs to 2026's last week (53).
    expect(isoWeek(weekIndex(at("2027-01-01T00:00:00Z")))).toMatchObject({ year: 2026, week: 53 });
  });

  test("parses only canonical week slugs", () => {
    expect(parseWeek("2026-44")?.index).toBe(weekIndex(at("2026-10-26T00:00:00Z")));
    expect(parseWeek("2026-01")?.index).toBe(weekIndex(at("2025-12-29T00:00:00Z")));
    expect(parseWeek("2026-53")?.slug).toBe("2026-53");
    expect(parseWeek("2025-53")).toBeNull();
    for (const bad of ["2026-00", "2026-54", "2026-4", "2026-W44", "26-44", "2026-44x"]) expect(parseWeek(bad)).toBeNull();
  });
});
