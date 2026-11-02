import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { FONTS, themeColors } from "../brand";
import { cueFrameOf, useBeat } from "../context";
import { TEXT_BLOCK } from "../lib/stage";
import { EASE_IN_OUT, progress } from "../motion";

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
  const sweep = progress(ctx.absFrame, at, 24, EASE_IN_OUT);
  const x = interpolate(sweep, [0, 1], [-60, 160]);
  const shine = ctx.theme === "dark" ? "rgba(255,255,255,0.95)" : "rgba(14,122,79,0.9)";

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
            color: colors.text,
            opacity: textIn,
            transform: `translateY(${(1 - textIn) * 30}px)`,
            backgroundImage: `linear-gradient(105deg, ${colors.text} ${x - 12}%, ${shine} ${x}%, ${colors.text} ${x + 12}%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
