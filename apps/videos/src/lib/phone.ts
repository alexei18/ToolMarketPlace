/*
 * The PhoneFrame: a fixed phone (the bezel never scales), and what part of the captured page its
 * screen shows at each moment. Zoom and pan happen inside the screen: the capture moves, the frame
 * stays. Pure, used by the scene, vo-check and render.ts.
 */
import type { CaptureMeta } from "../captures";
import { CENTER_X } from "./layout";
import type { Rect } from "./types";

export const PHONE_WIDTH = 640;
const BEZEL = 14;
/** Under the top caption band (y 280–380) and the "Illustrative" label; the bezel ends at y 1500. */
const PHONE_TOP = 440;
const PHONE_BOTTOM = 1500;

export interface PhoneLayout {
  outer: Rect;
  screen: Rect;
  /** Video px per CSS px with the whole page width on screen (no zoom). */
  scale: number;
}

export function phoneLayout(meta: Pick<CaptureMeta, "width">): PhoneLayout {
  const outer: Rect = { x: CENTER_X - PHONE_WIDTH / 2, y: PHONE_TOP, w: PHONE_WIDTH, h: PHONE_BOTTOM - PHONE_TOP };
  const screen: Rect = { x: outer.x + BEZEL, y: outer.y + BEZEL, w: outer.w - BEZEL * 2, h: outer.h - BEZEL * 2 };
  return { outer, screen, scale: screen.w / meta.width };
}

/** The part of the page on screen, in CSS px; its height follows the screen's aspect ratio. */
export interface View {
  x: number;
  y: number;
  w: number;
}

/** Zoom inside the screen onto a captured element on its cue word: the page is shown `scale` times larger. */
export interface ZoomSpec {
  cue: string;
  target: string;
  scale: number;
  /** Page x (CSS px) the view is centered on, instead of the target's center (e.g. to keep a left-aligned bar's start in view). */
  centerX?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Largest scroll that still fills the screen at no zoom. */
export function maxScroll(meta: CaptureMeta): number {
  const { screen, scale } = phoneLayout(meta);
  return Math.max(0, meta.height - screen.h / scale);
}

/** The view at a page scroll, no zoom. */
export function scrollView(meta: CaptureMeta, scrollY: number): View {
  return { x: 0, y: clamp(scrollY, 0, maxScroll(meta)), w: meta.width };
}

/** The view zoomed onto a target: the target centered on screen, kept inside the page. */
export function zoomView(meta: CaptureMeta, zoom: ZoomSpec): View {
  const t = targetBox(meta, zoom.target);
  const { screen } = phoneLayout(meta);
  const w = meta.width / zoom.scale;
  const h = (w * screen.h) / screen.w;
  return { x: clamp((zoom.centerX ?? t.x + t.w / 2) - w / 2, 0, meta.width - w), y: clamp(t.y + t.h / 2 - h / 2, 0, meta.height - h), w };
}

export function lerpView(a: View, b: View, t: number): View {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t };
}

/** Video px per CSS px for a view. */
export function viewScale(meta: CaptureMeta, view: View): number {
  return phoneLayout(meta).screen.w / view.w;
}

/** A box on the page (CSS px) in video px, for a view. */
export function toVideo(meta: CaptureMeta, view: View, r: Rect): Rect {
  const { screen } = phoneLayout(meta);
  const k = screen.w / view.w;
  return { x: screen.x + (r.x - view.x) * k, y: screen.y + (r.y - view.y) * k, w: r.w * k, h: r.h * k };
}

export function targetBox(meta: CaptureMeta, target: string): Rect {
  const t = meta.targets[target];
  if (!t) throw new Error(`Capture "${meta.name}" has no target "${target}"`);
  return { x: t.x, y: t.y, w: t.w, h: t.h };
}

export interface PhoneFrameSpec {
  capture?: string;
  scroll?: { cue?: string; y: number }[];
  zoom?: ZoomSpec;
  highlight?: { cue: string; target: string };
  cursor?: { cue: string; target: string; tap?: boolean }[];
}

/** The view once every scroll and the zoom have settled. */
export function finalView(meta: CaptureMeta, p: PhoneFrameSpec): View {
  return p.zoom ? zoomView(meta, p.zoom) : scrollView(meta, p.scroll?.at(-1)?.y ?? 0);
}

/**
 * Targets the voice talks about in a PhoneFrame: the highlight and the cursor's targets; the zoom
 * target only when nothing else is named (a zoom frames the view, it doesn't have to be legible as a whole).
 */
export function phoneTargets(p: PhoneFrameSpec): string[] {
  const named = [p.highlight?.target, ...(p.cursor ?? []).map((c) => c.target)].filter((t): t is string => !!t);
  return [...new Set(named.length ? named : p.zoom ? [p.zoom.target] : [])];
}
