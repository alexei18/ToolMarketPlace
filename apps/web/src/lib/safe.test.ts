import { describe, expect, test } from "bun:test";
import { safePath } from "./safe";

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
