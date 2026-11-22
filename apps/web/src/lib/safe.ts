/** A same-site path for `next` redirects, or null. Rejects `//host` and `/\host` (protocol-relative). */
export function safePath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || /^\/[\\/]/.test(next) || /[\u0000-\u001f]/.test(next)) return null;
  return next;
}
