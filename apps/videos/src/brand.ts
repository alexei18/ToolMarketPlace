import { loadFont } from "@remotion/fonts";
import { COLORS, FONTS } from "@tm/shared/brand";
import inter400 from "@fontsource/inter/files/inter-latin-400-normal.woff2";
import inter600 from "@fontsource/inter/files/inter-latin-600-normal.woff2";
import tight600 from "@fontsource/inter-tight/files/inter-tight-latin-600-normal.woff2";
import tight700 from "@fontsource/inter-tight/files/inter-tight-latin-700-normal.woff2";
import tight800 from "@fontsource/inter-tight/files/inter-tight-latin-800-normal.woff2";
// The logo files themselves, never redrawn or recolored: ink on light, white with the dark-mode green on dark.
import wordmarkLight from "../../../brand/tryworthy-logo/tryworthy-wordmark.svg";
import wordmarkDark from "../../../brand/tryworthy-logo/tryworthy-wordmark-white.svg";

export { COLORS, FONTS };

/** Aspect ratio of the wordmark's viewBox (9206.9 × 2112.9). */
export const WORDMARK_RATIO = 9206.9 / 2112.9;
export const WORDMARK = { light: wordmarkLight, dark: wordmarkDark } as const;

/** The two check paths of the logo (from tryworthy-wordmark.svg), for CheckDraw. Fills as in the file. */
export const LOGO_CHECKS = {
  viewBox: "2390 -1263.3 1650.7 1263.3",
  first: "M2645.3 -782.6 L2390.7 -782.6 L2617.6 0.0 L2872.3 0.0 L3196.5 -1118.0 L2941.9 -1118.0 L2745.0 -439.1 Z",
  second: "M3434.4 -827.3 L3179.8 -827.3 L3419.7 0.0 L3674.3 0.0 L4040.7 -1263.3 L3786.0 -1263.3 L3547.0 -439.1 Z",
} as const;

/** Inter (UI text) and Inter Tight (display), from local files. Remotion waits for them before rendering. */
for (const [family, weight, url] of [
  [FONTS.body, "400", inter400],
  [FONTS.body, "600", inter600],
  [FONTS.display, "600", tight600],
  [FONTS.display, "700", tight700],
  [FONTS.display, "800", tight800],
] as const) {
  loadFont({ family, url, weight, format: "woff2" });
}

export { themeColors, uiSceneBg } from "./lib/theme";
