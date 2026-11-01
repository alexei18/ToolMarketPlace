/*
 * JSON-LD from docs/SEO.md: typed builders that turn page data into one schema.org @graph per page.
 * No AggregateRating or Review anywhere: we have no ratings, and invented ones draw penalties.
 * No dependencies, safe for browser bundles.
 */
import type { PerkType, Platform, Pricing } from "./enums";

export type JsonLdNode = { "@type": string; "@id"?: string } & Record<string, unknown>;

export interface JsonLdGraph {
  "@context": "https://schema.org";
  "@graph": JsonLdNode[];
}

/** A breadcrumb or list entry; `url` is absolute. */
export interface JsonLdLink {
  name: string;
  url: string;
}

const graph = (...nodes: JsonLdNode[]): JsonLdGraph => ({ "@context": "https://schema.org", "@graph": nodes });

/**
 * JSON for a <script type="application/ld+json"> tag: `<`, `>` and `&` are escaped so no value can
 * close the tag, and U+2028/U+2029 so the text stays valid inside scripts.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028")
    .replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");
}

export function breadcrumbList(id: string, crumbs: JsonLdLink[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    "@id": id,
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.url })),
  };
}

/** Home: Organization + WebSite with a SearchAction to /search?q={search_term_string}. */
export function homeJsonLd(site: { name: string; url: string; logo: string }): JsonLdGraph {
  const url = site.url.replace(/\/$/, "");
  return graph(
    { "@type": "Organization", "@id": `${url}/#organization`, name: site.name, url: `${url}/`, logo: site.logo },
    {
      "@type": "WebSite",
      "@id": `${url}/#website`,
      name: site.name,
      url: `${url}/`,
      publisher: { "@id": `${url}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${url}/search?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
  );
}

/** Category, /top, /trending and /new: CollectionPage + ItemList of the products shown + BreadcrumbList. */
export function collectionPageJsonLd(page: { name: string; description: string; url: string; items: JsonLdLink[]; crumbs: JsonLdLink[] }): JsonLdGraph {
  return graph(
    {
      "@type": "CollectionPage",
      "@id": page.url,
      url: page.url,
      name: page.name,
      description: page.description,
      breadcrumb: { "@id": `${page.url}#breadcrumb` },
      mainEntity: { "@id": `${page.url}#items` },
    },
    {
      "@type": "ItemList",
      "@id": `${page.url}#items`,
      numberOfItems: page.items.length,
      itemListElement: page.items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, url: item.url })),
    },
    breadcrumbList(`${page.url}#breadcrumb`, page.crumbs),
  );
}

/** Any other indexable page (legal, about, perks, maker profiles…): WebPage + BreadcrumbList (Home › page). */
export function webPageJsonLd(page: { name: string; description: string; url: string; home: string }): JsonLdGraph {
  return graph(
    { "@type": "WebPage", "@id": page.url, url: page.url, name: page.name, description: page.description, breadcrumb: { "@id": `${page.url}#breadcrumb` } },
    breadcrumbList(`${page.url}#breadcrumb`, [
      { name: "Home", url: page.home },
      { name: page.name, url: page.url },
    ]),
  );
}

/** Google's applicationCategory values for our category slugs; the first mapped category wins. */
export const APPLICATION_CATEGORY: Record<string, string> = {
  ai: "UtilitiesApplication",
  "developer-tools": "DeveloperApplication",
  productivity: "BusinessApplication",
  design: "DesignApplication",
  marketing: "BusinessApplication",
  sales: "BusinessApplication",
  writing: "BusinessApplication",
  video: "MultimediaApplication",
  audio: "MultimediaApplication",
  finance: "FinanceApplication",
  education: "EducationalApplication",
  health: "HealthApplication",
  "no-code": "DeveloperApplication",
  analytics: "BusinessApplication",
  collaboration: "CommunicationApplication",
  "customer-support": "BusinessApplication",
  ecommerce: "BusinessApplication",
  security: "SecurityApplication",
  hr: "BusinessApplication",
  games: "GameApplication",
};

/** operatingSystem per platform; an API isn't an operating system, so it's left out. */
const OPERATING_SYSTEM: Record<Platform, string | null> = {
  web: "Web",
  ios: "iOS",
  android: "Android",
  extension: "Web browser",
  desktop: "Desktop",
  api: null,
};

const TRIAL_PERKS: PerkType[] = ["free_trial", "extended_trial"];

/**
 * Offers we can state truthfully: free and freemium products cost 0; a paid product only gets an
 * offer through an available trial perk (price 0 for the trial). Paid prices aren't stored, and an
 * Offer without a price is invalid, so otherwise there is none.
 */
function offersFor(pricing: Pricing, perks: { type: PerkType; title: string; available: boolean }[]): JsonLdNode[] {
  if (pricing === "free" || pricing === "freemium") return [{ "@type": "Offer", price: "0", priceCurrency: "USD", category: pricing }];
  const trial = perks.find((p) => p.available && TRIAL_PERKS.includes(p.type));
  return trial ? [{ "@type": "Offer", price: "0", priceCurrency: "USD", name: trial.title, category: "trial" }] : [];
}

/** Product: SoftwareApplication + BreadcrumbList (Home › first category › product). */
export function softwareApplicationJsonLd(p: {
  name: string;
  description: string;
  /** Canonical product page */
  url: string;
  images: string[];
  categorySlugs: string[];
  platforms: Platform[];
  pricing: Pricing;
  perks: { type: PerkType; title: string; available: boolean }[];
  publishedAt: number;
  maker: { name: string; url: string | null };
  crumbs: JsonLdLink[];
}): JsonLdGraph {
  const category = p.categorySlugs.map((s) => APPLICATION_CATEGORY[s]).find(Boolean);
  const os = [...new Set(p.platforms.map((x) => OPERATING_SYSTEM[x]).filter((x): x is string => !!x))].join(", ");
  const offers = offersFor(p.pricing, p.perks);
  const app: JsonLdNode = {
    "@type": "SoftwareApplication",
    "@id": `${p.url}#app`,
    name: p.name,
    description: p.description,
    url: p.url,
    datePublished: new Date(p.publishedAt * 1000).toISOString(),
    author: { "@type": "Person", name: p.maker.name, ...(p.maker.url ? { url: p.maker.url } : {}) },
  };
  if (p.images.length) app.image = p.images;
  if (category) app.applicationCategory = category;
  if (os) app.operatingSystem = os;
  if (offers.length) app.offers = offers.length === 1 ? offers[0] : offers;
  return graph(app, breadcrumbList(`${p.url}#breadcrumb`, p.crumbs));
}
