import { describe, expect, test } from "bun:test";
import { inlineJson, safePath } from "./safe";

describe("safePath", () => {
  test.each([
    ["/feed", "/feed"],
    ["/p/x?a=1", "/p/x?a=1"],
    ["//evil.com", null],
    ["/\\evil.com", null],
    ["https://evil.com", null],
    ["javascript:alert(1)", null],
    ["/a\nb", null],
    [null, null],
  ])("%p → %p", (input, out) => {
    expect(safePath(input)).toBe(out);
  });
});

test("inlineJson cannot close a script tag", () => {
  const s = inlineJson({ name: "</script><script>alert(1)</script>" });
  expect(s).not.toContain("</script>");
  expect(JSON.parse(s)).toEqual({ name: "</script><script>alert(1)</script>" });
});
