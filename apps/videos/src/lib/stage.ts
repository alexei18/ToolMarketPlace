/*
 * Where each scene puts its main element, in video px. The scenes place themselves with these
 * boxes and vo-check reads the same boxes, so a scene can't drift off the center line x = 540
 * without the check failing.
 */
import type { CaptureMeta } from "../captures";
import { centered, SAFE } from "./layout";
import { phoneLayout } from "./phone";
import type { BeatSpec, Rect } from "./types";

/** Text scenes (KineticText, LightSweep, CheckDraw, StatOrQuote, Endscreen): a centered column filling the safe zone. */
export const TEXT_BLOCK: Rect = SAFE;
export const CARD_REVEAL: Rect = centered(620, 780);

export interface MainElement {
  what: string;
  rect: Rect;
}

export function mainElement(beat: BeatSpec, captures: Record<string, CaptureMeta>): MainElement {
  switch (beat.scene) {
    case "PhoneFrame": {
      const name = (beat.props as { capture?: string } | undefined)?.capture;
      const meta = name ? captures[name] : undefined;
      if (!meta) throw new Error(`capture "${name}" is missing`);
      return { what: "phone", rect: phoneLayout(meta).outer };
    }
    case "CardReveal":
      return { what: "card", rect: CARD_REVEAL };
    default:
      return { what: "text block", rect: TEXT_BLOCK };
  }
}
