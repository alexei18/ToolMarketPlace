import React from "react";
import { AbsoluteFill, interpolate, spring } from "remotion";
import { COLORS, FONTS, themeColors } from "../brand";
import { cueFrameOf, useBeat } from "../context";
import { SAFE } from "../lib/layout";
import { SPRING_SETTLE } from "../motion";

export interface CardRevealProps {
  front: { title: string; text?: string };
  back: { title: string; text?: string; badge?: string };
  /** Cue word for the flip; defaults to the beat's cue. */
  flipCue?: string;
}

/** A card that spring-flips on its cue to reveal the back (e.g. a perk). Copy only from docs/COPY.md. */
export const CardReveal: React.FC<CardRevealProps> = ({ front, back, flipCue }) => {
  const ctx = useBeat();
  const colors = themeColors(ctx.theme);
  const at = cueFrameOf(ctx, ctx.fps, flipCue);
  const s = spring({ frame: ctx.absFrame - at, fps: ctx.fps, config: SPRING_SETTLE });
  const angle = interpolate(s, [0, 1], [0, 180]);
  const lift = Math.sin((angle / 180) * Math.PI);
  const w = 620;
  const h = 780;
  const face = (side: "front" | "back"): React.CSSProperties => ({
    position: "absolute",
    inset: 0,
    backfaceVisibility: "hidden",
    borderRadius: 36,
    padding: 56,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    gap: 18,
    background: side === "front" ? (ctx.theme === "dark" ? "#1C1C1B" : COLORS.surface) : COLORS.accentSoft,
    border: `2px solid ${side === "front" ? COLORS.border : COLORS.accent}`,
    transform: side === "back" ? "rotateY(180deg)" : undefined,
  });
  const title: React.CSSProperties = { fontFamily: FONTS.display, fontWeight: 800, fontSize: 64, letterSpacing: "-0.03em", lineHeight: 1.05, margin: 0 };
  const body: React.CSSProperties = { fontFamily: FONTS.body, fontSize: 34, lineHeight: 1.35, margin: 0 };

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      <div style={{ position: "absolute", left: SAFE.x + (SAFE.w - w) / 2, top: SAFE.y + (SAFE.h - h) / 2, width: w, height: h, perspective: 2200 }}>
        <div style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transform: `rotateY(${angle}deg) scale(${1 + lift * 0.06})` }}>
          <div style={{ ...face("front"), color: colors.text }}>
            <p style={title}>{front.title}</p>
            {front.text && <p style={{ ...body, color: colors.muted }}>{front.text}</p>}
          </div>
          <div style={{ ...face("back"), color: COLORS.ink }}>
            {back.badge && <p style={{ ...body, fontWeight: 600, color: COLORS.accent }}>{back.badge}</p>}
            <p style={title}>{back.title}</p>
            {back.text && <p style={{ ...body, color: COLORS.text2 }}>{back.text}</p>}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
