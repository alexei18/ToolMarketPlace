import type { Rect } from "./types";

/**
 * TikTok safe zone on 1080×1920: text, logos and key UI stay inside it. The bottom 500 px
 * (caption, music, buttons) and the right 220 px (like, comment, share) are covered by the app.
 */
export const SAFE: Rect = { x: 120, y: 260, w: 740, h: 1160 };

/** Caption block positions inside the safe zone. */
export const CAPTION_BOXES: Record<"top" | "bottom", Rect> = {
  top: { x: SAFE.x, y: SAFE.y, w: SAFE.w, h: 140 },
  bottom: { x: SAFE.x, y: SAFE.y + SAFE.h - 210, w: SAFE.w, h: 210 },
};

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function inside(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}
