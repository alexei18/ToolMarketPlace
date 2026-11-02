import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { COLORS, FONTS, themeColors } from "../brand";
import { cueFrameOf, useBeat } from "../context";
import { TEXT_BLOCK } from "../lib/stage";
import { progress } from "../motion";

export interface LightSweepProps {
  /** Headline the light passes over. */
  text: string;
  /** Cue word for the sweep; defaults to the beat's cue. */
  sweepCue?: string;
}

/** A single band of light that crosses the headline once, on its cue (dark scenes look best). */
export const LightSweep: React.FC<LightSweepProps> = ({ text, sweepCue }) => {
  const ctx = useBeat();
  const colors = themeColors(ctx.theme);
  const textIn = progress(ctx.absFrame, ctx.cueFrame, 12);
  const at = cueFrameOf(ctx, ctx.fps, sweepCue);
  // A steady pass over about a second: an eased one crosses the letters in a few frames and is missed.
  const sweep = progress(ctx.absFrame, at - 4, 30, (t) => t);
  const x = interpolate(sweep, [0, 1], [-20, 120]);
  // A band of the accent color crosses the text (white light over white text would not show).
  const shine = ctx.theme === "dark" ? COLORS.accentOnDark : COLORS.accent;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      <div style={{ position: "absolute", left: TEXT_BLOCK.x, top: TEXT_BLOCK.y, width: TEXT_BLOCK.w, height: TEXT_BLOCK.h, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div
          style={{
            fontFamily: FONTS.display,
            fontWeight: 800,
            fontSize: 112,
            lineHeight: 1.02,
            letterSpacing: "-0.02em",
            // The text itself is transparent: its letters show the gradient behind them (background-clip: text).
            color: "transparent",
            opacity: textIn,
            transform: `translateY(${(1 - textIn) * 30}px)`,
            backgroundImage: `linear-gradient(105deg, ${colors.text} ${x - 12}%, ${shine} ${x}%, ${colors.text} ${x + 12}%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
          }}
        >
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
