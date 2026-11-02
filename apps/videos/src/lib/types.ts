/* The video spec (specs/<ID>.json) and the aligned words (vo/<ID>.words.json). */

export type SceneName = "KineticText" | "PhoneFrame" | "CardCrop" | "CardReveal" | "LightSweep" | "CheckDraw" | "StatOrQuote";

/** A rectangle in video pixels (1080×1920). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BeatSpec {
  /** The spoken word that starts the beat: "save", or "save#2" for its second occurrence. */
  cue: string;
  scene: SceneName;
  props?: Record<string, unknown>;
  /** Captions during this beat: "none" hides them (default for scenes that show their own words). The band is per video (style.captions). */
  captions?: "show" | "none";
  /** The UI area the voice talks about during this beat, in video pixels. Captions must not cover it (vo-check). */
  focus?: Rect;
}

export interface VideoSpec {
  id: string;
  /** Batch prefix, e.g. "TW-B01" (video:batch). */
  batch?: string;
  concept: string;
  /** The creative attributes of the concept, for the tracking sheet (docs/tiktok-campaign.md). */
  meta?: { title: string; audience: string; message: string; hookType: string; hookText: string; visualStyle: string; animationStyle: string; coverText: string };
  /** The exact narration; must match vo/<ID>.txt word for word. */
  script: string;
  beats: BeatSpec[];
  style: {
    theme: "light" | "dark";
    /** Words shown in the accent color in captions and kinetic text. */
    keywords?: string[];
    /** The caption band for the whole video; default top when UI fills the middle (PhoneFrame, CardCrop), else bottom. */
    captions?: "top" | "bottom";
  };
  endscreen: "light" | "dark";
  /** Real-UI captures this video uses (scripts/capture.ts), by name. */
  captures?: Record<string, CaptureRecipe>;
  /** The TikTok cover still: the frame `offsetFrames` after this cue word ends. */
  cover?: { cue: string; offsetFrames?: number };
}

/**
 * How to capture a real page from the video-capture stack (seeded fictional catalog) with
 * Playwright. The page is not rebuilt: the capture can keep only some products and always hides
 * numbers (counts, dates, ranks), so nothing invented shows.
 */
export interface CaptureRecipe {
  /** App route, e.g. "/top" (see its page in apps/web/src/pages first). */
  route: string;
  /** Viewport in CSS px. A phone width (390) for PhoneFrame; for CardCrop, a width where the element's text reaches 40/32 px at 720 px wide. */
  width: number;
  height: number;
  /** Device scale factor of the PNG. */
  scale?: number;
  /** Product slugs to keep in lists (seed/products.ts); other product rows are removed. Optional: every product in the seed is fictional. */
  keepProducts?: string[];
  /** Named elements (CSS selectors, evaluated after the clean-up) whose boxes the scenes use. */
  targets?: Record<string, string>;
  /** Extra PNGs of the same page with attributes changed, e.g. { "saved": [{ "selector": "...", "attributes": { "aria-pressed": "true" } }] }. */
  states?: Record<string, { selector: string; attributes: Record<string, string> }[]>;
}

/** One spoken word with its timing in seconds, as written in the script. */
export interface Word {
  word: string;
  start: number;
  end: number;
}
