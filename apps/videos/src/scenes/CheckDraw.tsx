import React from "react";
import { AbsoluteFill } from "remotion";
import { COLORS, FONTS, LOGO_CHECKS, themeColors } from "../brand";
import { cueFrameOf, useBeat } from "../context";
import { TEXT_BLOCK } from "../lib/stage";
import { progress } from "../motion";

export interface CheckDrawProps {
  /** Cue for the second check (the first draws on the beat's cue). */
  secondCue?: string;
  /** Optional line under the checks. */
  text?: string;
}

/*
 * The two checks from the logo drawing themselves: the filled check shapes from the wordmark file,
 * revealed along their stroke (down, then up) by an animated mask. Shapes and colors are the
 * logo's own: ink (white on dark) for the first check, the brand green for the second.
 */
const STROKE = 300;
// Centerlines through the check shapes: down to the vertex, then up to the tip.
const FIRST = "M2518 -782 L2745 0 L3069 -1118";
const SECOND = "M3307 -827 L3547 0 L3913 -1263";
const LENGTH = 2100;

export const CheckDraw: React.FC<CheckDrawProps> = ({ secondCue, text }) => {
  const ctx = useBeat();
  const colors = themeColors(ctx.theme);
  const f = ctx.absFrame;
  const first = progress(f, ctx.cueFrame, 12);
  const secondAt = secondCue ? cueFrameOf(ctx, ctx.fps, secondCue) : ctx.cueFrame + 7;
  const second = progress(f, secondAt, 12);
  const textIn = progress(f, secondAt + 6, 12);
  const inkCheck = ctx.theme === "dark" ? "#FFFFFF" : COLORS.ink;
  const greenCheck = ctx.theme === "dark" ? COLORS.accentOnDark : COLORS.accent;
  const width = 520;
  const [, , vw, vh] = LOGO_CHECKS.viewBox.split(" ").map(Number) as [number, number, number, number];

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      <div style={{ position: "absolute", left: TEXT_BLOCK.x, top: TEXT_BLOCK.y, width: TEXT_BLOCK.w, height: TEXT_BLOCK.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <svg viewBox={LOGO_CHECKS.viewBox} width={width} height={(width * vh) / vw} overflow="visible">
          <defs>
            <mask id="cd-first" maskUnits="userSpaceOnUse">
              <path d={FIRST} stroke="#fff" strokeWidth={STROKE} fill="none" strokeLinecap="square" strokeLinejoin="miter" strokeDasharray={LENGTH} strokeDashoffset={LENGTH * (1 - first)} />
            </mask>
            <mask id="cd-second" maskUnits="userSpaceOnUse">
              <path d={SECOND} stroke="#fff" strokeWidth={STROKE} fill="none" strokeLinecap="square" strokeLinejoin="miter" strokeDasharray={LENGTH} strokeDashoffset={LENGTH * (1 - second)} />
            </mask>
          </defs>
          <path d={LOGO_CHECKS.first} fill={inkCheck} mask="url(#cd-first)" />
          <path d={LOGO_CHECKS.second} fill={greenCheck} mask="url(#cd-second)" />
        </svg>
        {text && (
          <div style={{ marginTop: 80, fontFamily: FONTS.display, fontWeight: 700, fontSize: 68, letterSpacing: "-0.03em", textAlign: "center", color: colors.text, opacity: textIn }}>{text}</div>
        )}
      </div>
    </AbsoluteFill>
  );
};
