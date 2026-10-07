/** Keyset cursor over (published_at DESC, id DESC). Format: `<unixSeconds>.<id>`. */
export function encodeCursor(time: number, id: string): string {
  return `${time}.${id}`;
}

export function decodeCursor(cursor: string | null | undefined): { time: number; id: string } | null {
  if (!cursor) return null;
  const m = cursor.match(/^(\d{1,12})\.([a-z0-9]{1,40})$/);
  if (!m) return null;
  return { time: Number(m[1]), id: m[2]! };
}
