export interface PageMetadata {
  title: string | null;
  description: string | null;
  image: string | null;
  favicon: string | null;
  siteName: string | null;
  /** All <meta name|property> values, lowercased keys. */
  meta: Map<string, string>;
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

function parseAttrs(src: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    attrs[m[1]!.toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

function clean(s: string | undefined | null, max: number): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function absolute(href: string | undefined | null, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString().replace(/^http:/, "https:") : null;
  } catch {
    return null;
  }
}

/** Extracts title, description, preview image (og:image → twitter:image) and favicon from an HTML document. */
export function extractMetadata(html: string, pageUrl: string): PageMetadata {
  const headEnd = html.search(/<\/head\s*>/i);
  const head = (headEnd > 0 ? html.slice(0, headEnd) : html).slice(0, 512 * 1024);

  const meta = new Map<string, string>();
  const icons: { rel: string; href: string; sizes: string }[] = [];
  const tagRe = /<(meta|link)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(head))) {
    const attrs = parseAttrs(m[2]!);
    if (m[1]!.toLowerCase() === "meta") {
      const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
      if (key && attrs.content !== undefined && !meta.has(key)) meta.set(key, attrs.content);
    } else if (attrs.rel && attrs.href) {
      const rel = attrs.rel.toLowerCase();
      if (rel.split(/\s+/).includes("icon") || rel === "apple-touch-icon") icons.push({ rel, href: attrs.href, sizes: attrs.sizes ?? "" });
    }
  }
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  const favicon =
    absolute(icons.find((i) => i.rel === "apple-touch-icon")?.href, pageUrl) ??
    absolute(icons.find((i) => /(^|\s)icon/.test(i.rel))?.href, pageUrl) ??
    absolute("/favicon.ico", pageUrl);

  return {
    title: clean(meta.get("og:title") ?? meta.get("twitter:title") ?? (titleTag ? decodeEntities(titleTag) : null), 200),
    description: clean(meta.get("og:description") ?? meta.get("description") ?? meta.get("twitter:description"), 1000),
    image: absolute(meta.get("og:image") ?? meta.get("og:image:url") ?? meta.get("og:image:secure_url") ?? meta.get("twitter:image") ?? meta.get("twitter:image:src"), pageUrl),
    favicon,
    siteName: clean(meta.get("og:site_name") ?? meta.get("application-name"), 80),
    meta,
  };
}

/** Splits a page title like "Acme — The best CRM for X" into a product name and a tagline. */
export function splitTitle(title: string, siteName: string | null): { name: string; tagline: string | null } {
  const parts = title.split(/\s+[|–—:·-]\s+/);
  if (parts.length >= 2) {
    const [first, ...rest] = parts;
    if (siteName && rest.join(" ").toLowerCase() === siteName.toLowerCase()) return { name: siteName, tagline: first! };
    return { name: first!, tagline: rest.join(" — ") };
  }
  return { name: siteName ?? title, tagline: siteName && siteName !== title ? title : null };
}
