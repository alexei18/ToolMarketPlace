import { describe, expect, test } from "bun:test";
import { collectionPageJsonLd, homeJsonLd, serializeJsonLd, softwareApplicationJsonLd, type JsonLdGraph, type JsonLdNode } from "./jsonld";

const SITE = "https://tryworthy.app";

/** Every key anywhere in the value. */
function keys(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(keys);
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => [k, ...keys(x)]);
  return [];
}

/** Every value of a URL-like property anywhere in the value. */
function urls(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(urls);
  if (v && typeof v === "object")
    return Object.entries(v).flatMap(([k, x]) => (["url", "item", "logo", "image", "urlTemplate"].includes(k) ? [x].flat().filter((s) => typeof s === "string") : urls(x)) as string[]);
  return [];
}

const node = (g: JsonLdGraph, type: string): JsonLdNode => g["@graph"].find((n) => n["@type"] === type)!;

/** Shared checks for every page type. */
function valid(g: JsonLdGraph) {
  expect(g["@context"]).toBe("https://schema.org");
  expect(keys(g).filter((k) => ["aggregateRating", "review", "reviews", "reviewRating", "ratingValue"].includes(k))).toEqual([]);
  expect(JSON.stringify(g)).not.toMatch(/"(AggregateRating|Review|Rating)"/);
  for (const u of urls(g)) expect(u).toStartWith(`${SITE}/`);
  expect(JSON.parse(serializeJsonLd(g))).toEqual(g);
}

const crumbs = [
  { name: "Home", url: `${SITE}/` },
  { name: "Productivity", url: `${SITE}/c/productivity` },
];

describe("home", () => {
  test("Organization + WebSite with a SearchAction", () => {
    const g = homeJsonLd({ name: "Tryworthy", url: `${SITE}/`, logo: `${SITE}/brand/icon-512.png` });
    valid(g);
    expect(node(g, "Organization")).toMatchObject({ name: "Tryworthy", url: `${SITE}/`, logo: `${SITE}/brand/icon-512.png` });
    expect(node(g, "WebSite").potentialAction).toEqual({
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    });
  });
});

describe("collection pages", () => {
  test("CollectionPage + ItemList of the products shown + BreadcrumbList", () => {
    const g = collectionPageJsonLd({
      name: "New Productivity apps worth trying — this week",
      description: "New productivity apps…",
      url: `${SITE}/c/productivity`,
      items: [
        { name: "Ledgerly", url: `${SITE}/p/ledgerly` },
        { name: "Quietly", url: `${SITE}/p/quietly` },
      ],
      crumbs,
    });
    valid(g);
    expect(node(g, "CollectionPage")).toMatchObject({ url: `${SITE}/c/productivity`, mainEntity: { "@id": `${SITE}/c/productivity#items` } });
    expect(node(g, "ItemList")).toMatchObject({
      numberOfItems: 2,
      itemListElement: [
        { "@type": "ListItem", position: 1, url: `${SITE}/p/ledgerly`, name: "Ledgerly" },
        { "@type": "ListItem", position: 2, url: `${SITE}/p/quietly`, name: "Quietly" },
      ],
    });
    expect(node(g, "BreadcrumbList").itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Productivity", item: `${SITE}/c/productivity` },
    ]);
  });
});

describe("product", () => {
  const base = {
    name: "Ledgerly",
    description: "Invoices that chase late payments for you.",
    url: `${SITE}/p/ledgerly`,
    images: [`${SITE}/img/a.webp`],
    categorySlugs: ["unknown", "finance", "productivity"],
    platforms: ["web", "ios", "api"] as const,
    perks: [],
    publishedAt: 1791790823,
    maker: { name: "Mara Ionescu", url: `${SITE}/m/mara_ionescu` },
    crumbs: [...crumbs, { name: "Ledgerly", url: `${SITE}/p/ledgerly` }],
  };

  test("SoftwareApplication + BreadcrumbList; category and OS from our data", () => {
    const g = softwareApplicationJsonLd({ ...base, platforms: [...base.platforms], pricing: "freemium" });
    valid(g);
    expect(node(g, "SoftwareApplication")).toMatchObject({
      name: "Ledgerly",
      url: `${SITE}/p/ledgerly`,
      image: [`${SITE}/img/a.webp`],
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web, iOS",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD", category: "freemium" },
    });
    expect(node(g, "BreadcrumbList").itemListElement).toHaveLength(3);
  });

  test("offers only when a price is known: free/freemium, or a trial perk on a paid product", () => {
    const app = (pricing: "free" | "freemium" | "paid", perks: { type: "free_trial" | "discount"; title: string; available: boolean }[]) =>
      node(softwareApplicationJsonLd({ ...base, platforms: [...base.platforms], pricing, perks }), "SoftwareApplication");
    expect(app("free", []).offers).toMatchObject({ price: "0", category: "free" });
    expect(app("paid", []).offers).toBeUndefined();
    expect(app("paid", [{ type: "discount", title: "20% off", available: true }]).offers).toBeUndefined();
    expect(app("paid", [{ type: "free_trial", title: "30 days free", available: false }]).offers).toBeUndefined();
    expect(app("paid", [{ type: "free_trial", title: "30 days free", available: true }]).offers).toEqual({
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      name: "30 days free",
      category: "trial",
    });
  });

  test("unknown categories, API-only products and products without images leave the fields out", () => {
    const a = node(softwareApplicationJsonLd({ ...base, images: [], categorySlugs: ["unknown"], platforms: ["api"], pricing: "paid" }), "SoftwareApplication");
    expect(Object.keys(a)).not.toContain("applicationCategory");
    expect(Object.keys(a)).not.toContain("operatingSystem");
    expect(Object.keys(a)).not.toContain("image");
  });
});

test("serialized JSON-LD cannot close its script tag", () => {
  const ls = String.fromCharCode(0x2028);
  const value = { name: `</script><script>alert(1)</script> & ${ls}` };
  const s = serializeJsonLd(value);
  for (const ch of ["<", ">", "&", ls]) expect(s).not.toContain(ch);
  expect(JSON.parse(s)).toEqual(value);
});
