import { describe, expect, test } from "bun:test";
import { markdownToText, renderLimitedMarkdown } from "./markdown";
import { slugify, newId } from "./ids";
import { decodeCursor, encodeCursor } from "./cursor";

describe("renderLimitedMarkdown", () => {
  test("escapes raw HTML", () => {
    expect(renderLimitedMarkdown('<script>alert("x")</script>')).toBe("<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>");
  });

  test("inline formatting and links", () => {
    expect(renderLimitedMarkdown("**Fast** and *simple* with `code` — [docs](https://x.com/a?b=1&c=2)")).toBe(
      '<p><strong>Fast</strong> and <em>simple</em> with <code>code</code> — <a href="https://x.com/a?b=1&amp;c=2" rel="nofollow ugc noopener" target="_blank">docs</a></p>',
    );
  });

  test("rejects non-http links", () => {
    expect(renderLimitedMarkdown("[x](javascript:alert(1))")).toBe("<p>[x](javascript:alert(1))</p>");
  });

  test("lists, headings, paragraphs", () => {
    expect(renderLimitedMarkdown("## Features\n- one\n- two\n\n1. a\n2. b\n\nline1\nline2")).toBe(
      "<h3>Features</h3>\n<ul><li>one</li><li>two</li></ul>\n<ol><li>a</li><li>b</li></ol>\n<p>line1<br>line2</p>",
    );
  });

  test("markdownToText", () => {
    expect(markdownToText("**Hello** [world](https://x.com)\n- item", 100)).toBe("Hello world item");
    expect(markdownToText("a".repeat(200), 10)).toBe("aaaaaaaaa…");
  });
});

describe("ids", () => {
  test("slugify", () => {
    expect(slugify("Ștefan's App & Tools!")).toBe("stefan-s-app-and-tools");
    expect(slugify("!!!")).toBe("product");
  });

  test("newId is sortable and lowercase", () => {
    const a = newId(1000);
    const b = newId(2000);
    expect(a < b).toBe(true);
    expect(a).toMatch(/^[0-9a-z]{26}$/);
  });

  test("cursor roundtrip", () => {
    expect(decodeCursor(encodeCursor(123, "abc"))).toEqual({ time: 123, id: "abc" });
    expect(decodeCursor("bad")).toBeNull();
  });
});
