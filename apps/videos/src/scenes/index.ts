import type React from "react";
import type { SceneName } from "../lib/types";
import { CardCrop } from "./CardCrop";
import { CardReveal } from "./CardReveal";
import { CheckDraw } from "./CheckDraw";
import { KineticText } from "./KineticText";
import { LightSweep } from "./LightSweep";
import { PhoneFrame } from "./PhoneFrame";
import { StatOrQuote } from "./StatOrQuote";

/** Scene components a spec beat can name. CursorTap is used inside PhoneFrame; Endscreen closes every video. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SCENES: Record<SceneName, React.FC<any>> = { KineticText, PhoneFrame, CardCrop, CardReveal, LightSweep, CheckDraw, StatOrQuote };

export { SHOWS_OWN_WORDS, captionPosition } from "./names";
