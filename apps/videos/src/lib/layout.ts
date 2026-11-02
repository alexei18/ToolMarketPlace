import type { Rect } from "./types";

/*
 * Layout rule (docs/tiktok-campaign.md). Everything is centered on the frame's center line
 * x = 540, never on the middle of a zone. TikTok covers the bottom 500 px (caption, music) and
 * the right edge (like, comment, share), so:
 * - SAFE: critical text and the UI the voice talks about, x 180–900 (720 px, symmetric) × y 260–1420.
 * - DECOR: decorative parts (phone bezel, shadows) may reach x 100–980; nothing important below 1420.
 */
export const CENTER_X = 540;
export const SAFE: Rect = { x: 180, y: 260, w: 720, h: 1160 };
export const DECOR: Rect = { x: 100, y: 200, w: 880, h: 1300 };
/** The vertical middle of the safe band (y 260–1420). */
export const CENTER_Y = SAFE.y + SAFE.h / 2;
/** How far a scene's main element may sit from x = 540 (vo-check). */
export const MAX_CENTER_OFFSET = 8;

/**
 * Caption bands, one per video: top (y 280–380) when UI fills the middle, otherwise bottom
 * (y 1180–1380). Captions are centered on x = 540 inside the band and never move to the other.
 */
export const CAPTION_BANDS: Record<"top" | "bottom", Rect> = {
  top: { x: SAFE.x, y: 280, w: SAFE.w, h: 100 },
  bottom: { x: SAFE.x, y: 1180, w: SAFE.w, h: 200 },
};

/** A box of the given size centered on x = 540 (and on `cy`, the middle of the safe band by default). */
export function centered(w: number, h: number, cy = CENTER_Y): Rect {
  return { x: CENTER_X - w / 2, y: cy - h / 2, w, h };
}

export function centerX(r: Rect): number {
  return r.x + r.w / 2;
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function inside(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}
