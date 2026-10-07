export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(src: string): string {
  // Input is already HTML-escaped. Protect code spans first so their content is left alone.
  const codes: string[] = [];
  let s = src.replace(/`([^`\n]+)`/g, (_, c: string) => {
    codes.push(`<code>${c}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]{1,2000})\)/g, (_, label: string, href: string) => {
    return `<a href="${href}" rel="nofollow ugc noopener" target="_blank">${label}</a>`;
  });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codes[Number(i)] ?? "");
}

/**
 * Renders the limited Markdown allowed in product descriptions: paragraphs, line breaks,
 * `##`/`###` headings, bullet and numbered lists, **bold**, *italic*, `code` and https links.
 * Everything is escaped first, so raw HTML in the source is shown as text.
 */
export function renderLimitedMarkdown(source: string): string {
  const lines = escapeHtml(source.replace(/\r\n?/g, "\n")).split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`);
    list = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
      flushList();
      continue;
    }
    const heading = trimmed.match(/^#{1,3}\s+(.+)$/);
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    const numbered = trimmed.match(/^\d{1,3}[.)]\s+(.+)$/);
    if (heading) {
      flushPara();
      flushList();
      out.push(`<h3>${inline(heading[1]!)}</h3>`);
    } else if (bullet || numbered) {
      flushPara();
      const tag = bullet ? "ul" : "ol";
      if (!list || list.tag !== tag) {
        flushList();
        list = { tag, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]!);
    } else {
      flushList();
      para.push(trimmed);
    }
  }
  flushPara();
  flushList();
  return out.join("\n");
}

/** Plain-text excerpt of limited Markdown, for meta descriptions and cards. */
export function markdownToText(source: string, max = 160): string {
  const plain = source
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}
