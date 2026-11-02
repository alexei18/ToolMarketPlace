/* Where the PhoneFrame sits, its camera, and where captured elements land in the video. Pure, used by scenes and vo-check. */
import type { CaptureMeta } from "../captures";
import { SAFE } from "./layout";
import type { BeatSpec, Rect } from "./types";

export const PHONE_WIDTH = 640;

export function phoneLayout(meta: Pick<CaptureMeta, "width">) {
  // Below the top caption box (140 px) and the "Illustrative" label, down to the bottom of the safe zone.
  const outer: Rect = { x: SAFE.x + (SAFE.w - PHONE_WIDTH) / 2, y: SAFE.y + 200, w: PHONE_WIDTH, h: SAFE.h - 200 };
  const bezel = 14;
  const screen: Rect = { x: outer.x + bezel, y: outer.y + bezel, w: outer.w - bezel * 2, h: outer.h - bezel * 2 };
  return { outer, screen, scale: screen.w / meta.width };
}

/** A captured element's box in video pixels, at a given page scroll (CSS px), before any camera zoom. */
export function targetRect(meta: CaptureMeta, target: string, scrollY: number): Rect {
  const t = meta.targets[target];
  if (!t) throw new Error(`Capture "${meta.name}" has no target "${target}"`);
  const { screen, scale } = phoneLayout(meta);
  return { x: screen.x + t.x * scale, y: screen.y + (t.y - scrollY) * scale, w: t.w * scale, h: t.h * scale };
}

/** Largest scroll that still fills the screen. */
export function maxScroll(meta: CaptureMeta): number {
  const { screen, scale } = phoneLayout(meta);
  return Math.max(0, meta.height - screen.h / scale);
}

/** Camera zoom on a target: at full zoom the target's centre sits at `center` (video px), scaled by `scale`. */
export interface ZoomSpec {
  cue: string;
  target: string;
  scale: number;
  /** Where the target's centre ends up; defaults to the middle of the safe zone below the caption box. */
  center?: { x: number; y: number };
}

export interface Camera {
  /** CSS transform for a layer whose origin is the video's top-left corner. */
  transform: string;
  apply(r: Rect): Rect;
}

/**
 * The camera at zoom progress t (0 = none, 1 = full): p' = A(t) + s(t)·(p − T), A moving from T to
 * the centre. By default the target is centred horizontally in the safe zone and the phone's top
 * edge stays put, so the zoom grows downward and never slides under the top caption box.
 */
export function cameraAt(meta: CaptureMeta, zoom: ZoomSpec | undefined, scrollY: number, t: number): Camera {
  if (!zoom || t <= 0) return { transform: "none", apply: (r) => r };
  const r = targetRect(meta, zoom.target, scrollY);
  const T = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const top = phoneLayout(meta).outer.y;
  const C = zoom.center ?? { x: SAFE.x + SAFE.w / 2, y: top + zoom.scale * (T.y - top) };
  const s = 1 + (zoom.scale - 1) * t;
  const A = { x: T.x + (C.x - T.x) * t, y: T.y + (C.y - T.y) * t };
  return {
    transform: `translate(${A.x - s * T.x}px, ${A.y - s * T.y}px) scale(${s})`,
    apply: (q) => ({ x: A.x + s * (q.x - T.x), y: A.y + s * (q.y - T.y), w: q.w * s, h: q.h * s }),
  };
}

function union(rects: Rect[]): Rect | undefined {
  if (rects.length === 0) return undefined;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
}

/**
 * What the voice talks about during a beat, in video px: the spec's `focus`, or for a PhoneFrame
 * the highlighted element and the cursor's targets, at the final scroll and full zoom.
 */
export function beatFocus(beat: BeatSpec, captures: Record<string, CaptureMeta>): Rect | undefined {
  if (beat.focus) return beat.focus;
  if (beat.scene !== "PhoneFrame") return undefined;
  const p = (beat.props ?? {}) as { capture?: string; scroll?: { y: number }[]; highlight?: { target: string }; cursor?: { target: string }[]; zoom?: ZoomSpec };
  const meta = p.capture ? captures[p.capture] : undefined;
  if (!meta) return undefined;
  const scroll = Math.min(p.scroll?.at(-1)?.y ?? 0, maxScroll(meta));
  const cam = cameraAt(meta, p.zoom, scroll, 1);
  const targets = [p.highlight?.target, ...(p.cursor ?? []).map((c) => c.target)].filter((t): t is string => !!t);
  return union(targets.map((t) => cam.apply(targetRect(meta, t, scroll))));
}
