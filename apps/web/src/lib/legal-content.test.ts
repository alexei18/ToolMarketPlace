/* The legal Markdown (src/content/legal) stays within the rules a lawyer's edits could break. */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EXPORT_LINK_HOURS, MODERATION_RULES, RAW_SIGNAL_DAYS, READ_NOTIFICATION_DAYS, REPORTER_EMAIL_MONTHS, VERIFICATION_MAX_AGE_HOURS } from "@tm/shared";
import { DESCRIPTION_MAX } from "./seo";

const DIR = join(import.meta.dir, "../content/legal");
const PLACEHOLDERS = ["[OPERATOR_NAME]", "[OPERATOR_ADDRESS]", "[CONTACT_EMAIL]", "[PRIVACY_EMAIL]", "[DSA_CONTACT_EMAIL]", "[EU_REPRESENTATIVE]", "[GOVERNING_LAW_COUNTRY]", "[MIN_AGE]"];
/** CLAUDE.md */
const BANNED = /\b(revolutionary|game-changer|unlock\w*|supercharge\w*|seamless\w*|ultimate)\b|#1\b/i;
const ROUTES = new Set(["/terms", "/terms/makers", "/privacy", "/cookies", "/guidelines", "/report", "/legal", "/ranking", "/settings"]);

const files = Object.fromEntries(readdirSync(DIR).map((f) => [f.replace(/\.md$/, ""), readFileSync(join(DIR, f), "utf8")]));

describe("legal pages content", () => {
  test("all seven pages exist with a title, a short description and a date", () => {
    expect(Object.keys(files).sort()).toEqual(["cookies", "guidelines", "legal", "makers-terms", "privacy", "report", "terms"]);
    for (const [id, md] of Object.entries(files)) {
      const front = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
      expect(front, id).toMatch(/^title: .+/m);
      expect(front, id).toMatch(/^updated: \d{4}-\d{2}-\d{2}$/m);
      expect(front.match(/^description: (.+)$/m)?.[1]?.length ?? 0, id).toBeLessThanOrEqual(DESCRIPTION_MAX);
    }
  });

  test("the README lists every placeholder to fill in before launch", () => {
    const readme = readFileSync(join(import.meta.dir, "../../../../README.md"), "utf8");
    const listed = [...readme.matchAll(/^\| `(\[[A-Z_]+\])` \|/gm)].map((m) => m[1]);
    expect(listed.sort()).toEqual([...PLACEHOLDERS].sort());
  });

  test("only the agreed placeholders, and each one is used", () => {
    const all = Object.values(files).join("\n");
    expect([...new Set(all.match(/\[[A-Z_]+\]/g))].sort()).toEqual([...PLACEHOLDERS].sort());
  });

  test("no banned words and no links to pages that don't exist", () => {
    for (const [id, md] of Object.entries(files)) {
      expect(md.match(BANNED)?.[0] ?? null, id).toBeNull();
      for (const [, href] of md.matchAll(/\]\((\/[^)#\s]*)/g)) expect(ROUTES.has(href!), `${id}: ${href}`).toBe(true);
    }
  });

  test("every moderation rule links to a section that exists", () => {
    const page = { "/guidelines": "guidelines", "/terms/makers": "makers-terms" } as Record<string, string>;
    const slug = (h: string) => h.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-");
    for (const [id, rule] of Object.entries(MODERATION_RULES)) {
      const [path, anchor] = rule.href.split("#");
      const md = files[page[path!]!]!;
      expect(md, id).toBeDefined();
      const headings = [...md.matchAll(/^#+ (.+)$/gm)].map((m) => slug(m[1]!));
      expect(headings, id).toContain(anchor!);
    }
  });

  test("the Privacy Policy states the retention periods the cleanup job uses", () => {
    const md = files.privacy!;
    const num = (re: RegExp) => Number(md.match(re)?.[1]);
    expect(num(/any link older than (\d+) hours/)).toBe(VERIFICATION_MAX_AGE_HOURS);
    expect(num(/Read notifications are deleted after (\d+) days/)).toBe(READ_NOTIFICATION_DAYS);
    expect(num(/individual records are deleted after (\d+) days/)).toBe(RAW_SIGNAL_DAYS);
    expect(num(/The download link works for (\d+) hours/)).toBe(EXPORT_LINK_HOURS);
    expect(num(/Your email address is deleted (\d+) months after we decide the report/)).toBe(REPORTER_EMAIL_MONTHS);
  });
});
