/* The stage's colors, plain data so video-check can measure their contrast. */
import { COLORS } from "@tm/shared/brand";

export const KIT = {
  bg: "#0A0A0A",
  text: "#F5F5F3",
  /** Secondary text: white at 45%. */
  secondary: "rgba(245,245,243,0.45)",
  /** Words not spoken yet: white at 30%. */
  unspoken: "rgba(245,245,243,0.30)",
  /** At most one green element per frame. */
  accent: COLORS.accentOnDark,
} as const;
