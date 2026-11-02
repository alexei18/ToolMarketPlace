/*
 * Theme colors for scenes, captions and the endscreen, plain data so vo-check can measure their
 * contrast. Light and dark videos; dark ones use the white wordmark and dark captions.
 */
import { COLORS } from "@tm/shared/brand";

export type Theme = "light" | "dark";

export const themeColors = (theme: Theme) =>
  theme === "dark"
    ? { bg: COLORS.ink, text: "#FFFFFF", muted: "#A3A3A0", accent: COLORS.accentOnDark }
    : { bg: COLORS.bg, text: COLORS.ink, muted: COLORS.text2, accent: COLORS.accent };

/** Background behind UI scenes (PhoneFrame, CardCrop): a soft surface on light, ink on dark. */
export const uiSceneBg = (theme: Theme) => (theme === "dark" ? COLORS.ink : COLORS.surface);

/** The caption box: near-opaque, so captions read the same over any scene. */
export const captionColors = (theme: Theme) =>
  theme === "dark"
    ? { box: "rgba(17,17,17,0.86)", text: "#FFFFFF", accent: COLORS.accentOnDark, shadow: "none" }
    : { box: "rgba(255,255,255,0.94)", text: COLORS.ink, accent: COLORS.accent, shadow: `0 10px 30px rgba(17,17,17,0.12), 0 0 0 1px ${COLORS.border}` };

type RGB = [number, number, number];

function parse(color: string): { rgb: RGB; a: number } {
  const m = color.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const [r, g, b, a] = m[1]!.split(",").map((v) => Number(v.trim()));
    return { rgb: [r!, g!, b!], a: a ?? 1 };
  }
  const n = parseInt(color.replace("#", ""), 16);
  return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], a: 1 };
}

/** A color (possibly translucent) painted over an opaque background. */
export function over(color: string, bg: string): string {
  const c = parse(color);
  const b = parse(bg).rgb;
  const mix = c.rgb.map((v, i) => Math.round(v * c.a + b[i]! * (1 - c.a)));
  return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function luminance(color: string): number {
  const [r, g, b] = parse(color).rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two opaque colors. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
