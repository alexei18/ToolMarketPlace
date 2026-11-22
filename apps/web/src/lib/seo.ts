import { markdownToText } from "@tm/shared";
import { en } from "@tm/shared/copy";

/** docs/SEO.md limits. */
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;

/** Child sitemaps listed in /sitemap.xml (pages/sitemaps/[kind].xml.ts). */
export const SITEMAPS = ["pages", "products", "categories", "makers", "weeks"] as const;

export interface SeoText {
  title: string;
  description: string;
}

/** Shortens text to `max` characters on a word boundary, ending in "…" when cut. */
export function clip(text: string, max: number): string {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  // A single word longer than the limit is cut mid-word rather than dropped.
  const head = space > max / 3 ? cut.slice(0, space) : cut;
  return `${head.replace(/[\s,;:.\-–—·]+$/, "")}…`;
}

/** "<name> · <site>", with the name shortened so the site name always fits. */
export function withSite(name: string, siteName: string): string {
  const suffix = ` · ${siteName}`;
  return clip(name, TITLE_MAX - suffix.length) + suffix;
}

/** A category name as it reads mid-sentence: "Sales & CRM" → "sales & CRM", "AI" stays "AI". */
export function midSentence(name: string): string {
  return name.replace(/\p{L}+/gu, (w) => (w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase()));
}

export function homeSeo(siteName: string): SeoText {
  return { title: withSite(en.seo.home.title, siteName), description: en.seo.home.description };
}

export function categorySeo(name: string, siteName: string): SeoText {
  return { title: withSite(en.seo.category.title(name), siteName), description: clip(en.seo.category.description(midSentence(name)), DESCRIPTION_MAX) };
}

/** Top this week and Trending across all categories (the /top and /trending pages). */
export function topSeo(siteName: string): SeoText {
  return { title: withSite(en.seo.top.title, siteName), description: en.seo.top.description };
}

export function newSeo(siteName: string): SeoText {
  return { title: withSite(en.seo.new.title, siteName), description: en.seo.new.description };
}

/** A category's weekly archive, /c/[category]/week/[yyyy]-[ww]. */
export function weekSeo(name: string, week: number, year: number, siteName: string): SeoText {
  return {
    title: withSite(en.seo.week.title(name, week, year), siteName),
    description: clip(en.seo.week.description(midSentence(name), week, year), DESCRIPTION_MAX),
  };
}

export function perksSeo(siteName: string): SeoText {
  return { title: withSite(en.seo.perks.title, siteName), description: en.seo.perks.description };
}

export function makerSeo(name: string, siteName: string): SeoText {
  const suffix = en.seo.maker.titleSuffix(siteName);
  return { title: clip(name, TITLE_MAX - suffix.length) + suffix, description: clip(en.seo.maker.description(name, siteName), DESCRIPTION_MAX) };
}

/** Whole sentences that fit in `max` characters; falls back to a word-boundary cut. */
export function leadSentences(text: string, max: number): string {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const ends = [...s.slice(0, max).matchAll(/[.!?](?=\s)/g)].map((m) => m.index! + 1);
  const end = ends.pop();
  return end && end >= max / 3 ? s.slice(0, end) : clip(s, max);
}

/** "[Short description, ~120 chars]. [Perk sentence if any]", within 155 characters. */
export function productSeo(p: { title: string; tagline: string; description: string; perks: { title: string; available: boolean }[] }, siteName: string): SeoText {
  const perk = p.perks.find((x) => x.available);
  const perkSentence = perk ? ` ${en.seo.product.perk(perk.title.replace(/[.!?]+$/, ""), siteName)}` : "";
  // The perk sentence is kept whole when it fits; the description gets the rest of the room.
  const room = perkSentence.length < 60 ? Math.min(120, DESCRIPTION_MAX - perkSentence.length - 1) : 120;
  const short = leadSentences(markdownToText(p.description, 600), room);
  const description = (/[.!?…]$/.test(short) ? short : `${short}.`) + perkSentence;
  return { title: withSite(en.seo.product.title(p.title, p.tagline), siteName), description: clip(description, DESCRIPTION_MAX) };
}
