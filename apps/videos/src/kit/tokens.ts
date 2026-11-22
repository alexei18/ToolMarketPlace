/*
 * The video identity (docs/video-motion-bible.md): a dark stage, white product. Colors, type and the
 * two layout modes every kit component uses. Fonts come from local files; Remotion waits for them.
 */
import { loadFont } from "@remotion/fonts";
import inter500 from "@fontsource/inter/files/inter-latin-500-normal.woff2";
import mono500 from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2";
import { FONTS } from "../brand";
import { KIT } from "./tokens-data";

const MONO = "JetBrains Mono";
loadFont({ family: FONTS.body, url: inter500, weight: "500", format: "woff2" });
loadFont({ family: MONO, url: mono500, weight: "500", format: "woff2" });

export { KIT };

export const TYPE = {
  headline: { fontFamily: FONTS.display, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 0.95 },
  hud: { fontFamily: MONO, fontWeight: 500, fontSize: 22, letterSpacing: "0.2em", textTransform: "uppercase", color: KIT.secondary },
  caption: { fontFamily: FONTS.body, fontWeight: 500, fontSize: 46 },
} as const;

/** Headlines, 120–220 px at 1080. */
export const HEADLINE_SIZE = { min: 120, max: 220 } as const;

/** Every scene picks one: centered on x = 540, or editorial on the fixed left margin x = 96 with the title on top. */
export type LayoutMode = "centered" | "editorial";
export const LAYOUT = {
  centerX: 540,
  editorialX: 96,
  /** Important text stays inside this box. */
  safe: { x: 96, y: 260, w: 804, h: 1160 },
  captionY: 1250,
} as const;
