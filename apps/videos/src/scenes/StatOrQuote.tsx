import React from "react";
import { AbsoluteFill } from "remotion";
import { FONTS, themeColors } from "../brand";
import { spokenTimes, useBeat } from "../context";
import { TEXT_BLOCK } from "../lib/stage";
import { normalizeWord } from "../lib/words";
import { progress } from "../motion";

export interface StatOrQuoteProps {
  /** A short statement or quote. Text only: digits are refused, so no invented numbers slip in. */
  text: string;
  /** e.g. "How ranking works" — never a real person or company. */
  label?: string;
}

export const StatOrQuote: React.FC<StatOrQuoteProps> = ({ text, label }) => {
  if (/\d/.test(text) || (label && /\d/.test(label))) throw new Error(`StatOrQuote is text only, no numbers: "${text}"`);
  const ctx = useBeat();
  const colors = themeColors(ctx.theme);
  const keys = new Set(ctx.keywords.map(normalizeWord));
  const words = text.split(/\s+/);
  const times = spokenTimes(ctx, ctx.fps, words);
  const labelIn = progress(ctx.absFrame, ctx.cueFrame, 10);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      <div
        style={{ position: "absolute", left: TEXT_BLOCK.x, top: TEXT_BLOCK.y, width: TEXT_BLOCK.w, height: TEXT_BLOCK.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}
      >
        {label && <div style={{ fontFamily: FONTS.body, fontWeight: 600, fontSize: 34, color: colors.accent, opacity: labelIn }}>{label}</div>}
        <div style={{ width: 96 * labelIn, height: 8, borderRadius: 4, background: colors.accent, margin: "28px 0 36px" }} />
        <div>
          <p style={{ margin: 0, fontFamily: FONTS.display, fontWeight: 700, fontSize: 70, lineHeight: 1.12, letterSpacing: "-0.02em", color: colors.text }}>
            {words.map((w, i) => {
              const p = progress(ctx.absFrame, times[i]![0], 6);
              return (
                <span key={i} style={{ opacity: 0.15 + 0.85 * p, color: keys.has(normalizeWord(w)) && p > 0.5 ? colors.accent : undefined }}>
                  {w}{" "}
                </span>
              );
            })}
          </p>
        </div>
      </div>
    </AbsoluteFill>
  );
};
