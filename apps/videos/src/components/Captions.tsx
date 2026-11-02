import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONTS, themeColors } from "../brand";
import type { CaptionPage } from "../lib/captions";
import { CAPTION_BOXES } from "../lib/layout";

/**
 * Burned-in captions: one page of 2–4 words at a time, each word lighting up as it is spoken,
 * keywords in the accent color. The box sits top or bottom of the safe zone, per beat.
 */
export const Captions: React.FC<{ pages: CaptionPage[]; positionOf: (beat: number) => "top" | "bottom" | "none"; theme: "light" | "dark" }> = ({ pages, positionOf, theme }) => {
  const frame = useCurrentFrame();
  const page = pages.find((p) => frame >= p.from && frame < p.until);
  if (!page) return null;
  const pos = positionOf(page.beat);
  if (pos === "none") return null;
  const box = CAPTION_BOXES[pos];
  const colors = themeColors(theme);
  const pop = interpolate(frame, [page.from, page.from + 4], [0.94, 1], { extrapolateRight: "clamp" });

  return (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, display: "flex", alignItems: pos === "top" ? "flex-start" : "flex-end", justifyContent: "center" }}>
      <div
        style={{
          maxWidth: box.w,
          padding: "14px 28px 18px",
          borderRadius: 26,
          background: theme === "dark" ? "rgba(17,17,17,0.86)" : "rgba(255,255,255,0.94)",
          boxShadow: theme === "dark" ? "none" : `0 10px 30px rgba(17,17,17,0.12), 0 0 0 1px ${COLORS.border}`,
          textAlign: "center",
          fontFamily: FONTS.display,
          fontWeight: 600,
          fontSize: 58,
          lineHeight: 1.12,
          letterSpacing: "-0.02em",
          color: colors.text,
          transform: `scale(${pop})`,
        }}
      >
        {page.words.map((w, i) => (
          <span key={i} style={{ color: w.keyword ? colors.accent : undefined, opacity: frame >= w.start ? 1 : 0.32 }}>
            {w.text}
            {i < page.words.length - 1 ? " " : ""}
          </span>
        ))}
      </div>
    </div>
  );
};
