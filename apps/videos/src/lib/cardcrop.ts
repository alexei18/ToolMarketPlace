/*
 * CardCrop: the real capture of the one card or row the voice talks about, cut out of the page
 * and shown about 720 px wide, centered on x = 540. Pure, used by the scene, vo-check and render.ts.
 */
import type { CaptureMeta } from "../captures";
import { centered } from "./layout";
import { targetBox } from "./phone";
import type { Rect } from "./types";

/** Width of the captured UI in the video (the safe zone's width). */
export const CARD_WIDTH = 720;
/** The white card around it (decoration, may reach into the decoration zone). */
export const CARD_PAD = 28;

export interface CardCropSpec {
  capture?: string;
  /** The captured element shown (a row or card); its whole box is what the voice talks about. */
  target?: string;
  cursor?: { cue: string; target: string; tap?: boolean }[];
  state?: { cue: string; name: string; delayFrames?: number };
}

export interface CardLayout {
  /** The element's box on the page, CSS px. */
  crop: Rect;
  /** Video px per CSS px. */
  scale: number;
  /** Where the captured UI lands, video px. */
  image: Rect;
  /** The card behind it, video px. */
  card: Rect;
}

export function cardLayout(meta: CaptureMeta, target: string): CardLayout {
  const crop = targetBox(meta, target);
  const scale = CARD_WIDTH / crop.w;
  const image = centered(CARD_WIDTH, crop.h * scale);
  const card = { x: image.x - CARD_PAD, y: image.y - CARD_PAD, w: image.w + CARD_PAD * 2, h: image.h + CARD_PAD * 2 };
  return { crop, scale, image, card };
}

/** A box on the page (CSS px) in video px. */
export function cardToVideo(l: CardLayout, r: Rect): Rect {
  return { x: l.image.x + (r.x - l.crop.x) * l.scale, y: l.image.y + (r.y - l.crop.y) * l.scale, w: r.w * l.scale, h: r.h * l.scale };
}
