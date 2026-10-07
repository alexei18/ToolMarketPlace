/** A same-site path for `next` redirects, or null. Rejects `//host` and `/\host` (protocol-relative). */
export function safePath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || /^\/[\\/]/.test(next) || /[\u0000-\u001f]/.test(next)) return null;
  return next;
}

/** JSON for an inline <script> tag: escapes `<`, `>` and `&` so content can't close the tag. */
export function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
