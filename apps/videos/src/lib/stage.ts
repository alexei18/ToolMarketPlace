/*
 * Where each scene puts its main element and the UI the voice talks about, in video px. The
 * scenes place themselves with these boxes and video-check reads the same boxes, so a scene can't
 * drift off the center line x = 540 or shrink the UI's text without the check failing.
 */
import type { CaptureMeta } from "../captures";
import { cardLayout, type CardCropSpec } from "./cardcrop";
import { centered, SAFE } from "./layout";
import { finalView, phoneLayout, phoneTargets, targetBox, toVideo, viewScale, type PhoneFrameSpec } from "./phone";
import type { BeatSpec, Rect } from "./types";

/** Text scenes (KineticText, LightSweep, CheckDraw, StatOrQuote, Endscreen): a centered column filling the safe zone. */
export const TEXT_BLOCK: Rect = SAFE;
export const CARD_REVEAL: Rect = centered(620, 780);

/** Minimum text size, in video px, for the UI the voice talks about. */
export const MIN_TEXT = { name: 40, secondary: 32 };

export interface MainElement {
  what: string;
  rect: Rect;
}

function captureOf(beat: BeatSpec, captures: Record<string, CaptureMeta>): CaptureMeta {
  const name = (beat.props as { capture?: string } | undefined)?.capture;
  const meta = name ? captures[name] : undefined;
  if (!meta) throw new Error(`capture "${name}" is missing`);
  return meta;
}

function cardTarget(beat: BeatSpec): string {
  const t = (beat.props as CardCropSpec | undefined)?.target;
  if (!t) throw new Error(`CardCrop needs a "target"`);
  return t;
}

export function mainElement(beat: BeatSpec, captures: Record<string, CaptureMeta>): MainElement {
  switch (beat.scene) {
    case "PhoneFrame":
      return { what: "phone", rect: phoneLayout(captureOf(beat, captures)).outer };
    case "CardCrop":
      return { what: "card", rect: cardLayout(captureOf(beat, captures), cardTarget(beat)).image };
    case "CardReveal":
      return { what: "card", rect: CARD_REVEAL };
    default:
      return { what: "text block", rect: TEXT_BLOCK };
  }
}

/** A captured element the voice talks about, and how large its text ends up in the video. */
export interface UiText {
  target: string;
  box: Rect;
  /** Smallest name (heading) and other text in the element, video px; undefined when it has none. */
  name?: number;
  secondary?: number;
}

/** What the voice talks about in a beat: the spec's `focus`, or the UI elements of a PhoneFrame or CardCrop (settled view). */
export function talkedAbout(beat: BeatSpec, captures: Record<string, CaptureMeta>): UiText[] {
  const text = (meta: CaptureMeta, target: string, scale: number, box: Rect): UiText => {
    const t = meta.targets[target]?.text;
    return { target, box, ...(t?.name ? { name: t.name * scale } : {}), ...(t?.secondary ? { secondary: t.secondary * scale } : {}) };
  };
  if (beat.scene === "PhoneFrame") {
    const p = (beat.props ?? {}) as PhoneFrameSpec;
    const meta = captureOf(beat, captures);
    const view = finalView(meta, p);
    return phoneTargets(p).map((t) => text(meta, t, viewScale(meta, view), toVideo(meta, view, targetBox(meta, t))));
  }
  if (beat.scene === "CardCrop") {
    const meta = captureOf(beat, captures);
    const l = cardLayout(meta, cardTarget(beat));
    return [text(meta, cardTarget(beat), l.scale, l.image)];
  }
  return [];
}

function union(rects: Rect[]): Rect | undefined {
  if (rects.length === 0) return undefined;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
}

/** The area captions must not cover: the spec's `focus`, else the UI the voice talks about. */
export function beatFocus(beat: BeatSpec, captures: Record<string, CaptureMeta>): Rect | undefined {
  return beat.focus ?? union(talkedAbout(beat, captures).map((u) => u.box));
}
