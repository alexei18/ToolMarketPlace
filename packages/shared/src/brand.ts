/*
 * Brand tokens shared outside the site (videos, images). The site's own CSS variables in
 * apps/web/src/styles/global.css use the same values; the logo files are in brand/tryworthy-logo/.
 * No dependencies, safe for any bundle (import from "@tm/shared/brand").
 */

export const COLORS = {
  /** Text and dark surfaces. */
  ink: "#111111",
  /** The brand green on light backgrounds (the second check of the logo, links, buttons). */
  accent: "#0E7A4F",
  accentHover: "#0B6541",
  /** The brand green on dark backgrounds (the logo's green on ink). */
  accentOnDark: "#3CCB8A",
  accentSoft: "#EAF3EE",
  bg: "#FFFFFF",
  surface: "#F7F7F5",
  surface2: "#EFEFEC",
  text2: "#6B6B6B",
  text3: "#8F8F8B",
  border: "#E8E8E6",
  borderStrong: "#D4D4D0",
} as const;

export const FONTS = {
  /** Body and UI text (the site's font). */
  body: "Inter",
  /** Display text: headlines, captions, kinetic type. */
  display: "Inter Tight",
} as const;
