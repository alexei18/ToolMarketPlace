import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONTS, themeColors } from "../brand";
import { captionFontSize, CAPTION_FONT, type CaptionPage } from "../lib/captions";
import { CAPTION_BANDS } from "../lib/layout";

/**
 * Burned-in captions: one page of 2–4 words at a time on one line, each word lighting up as it is
 * spoken, keywords in the accent color. Centered on x = 540 in the video's one band (top or
 * bottom), the same for every page; beats that show their own words hide them.
 */
export const Captions: React.FC<{ pages: CaptionPage[]; band: "top" | "bottom"; shown: (beat: number) => boolean; theme: "light" | "dark" }> = ({ pages, band, shown, theme }) => {
  const frame = useCurrentFrame();
  const page = pages.find((p) => frame >= p.from && frame < p.until);
  if (!page || !shown(page.beat)) return null;
  const box = CAPTION_BANDS[band];
  const colors = themeColors(theme);
  const pop = interpolate(frame, [page.from, page.from + 4], [0.94, 1], { extrapolateRight: "clamp" });
  const size = captionFontSize(page.words.map((w) => w.text).join(" "), box.w);

  return (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          padding: `10px ${CAPTION_FONT.padX}px 14px`,
          borderRadius: 26,
          background: theme === "dark" ? "rgba(17,17,17,0.86)" : "rgba(255,255,255,0.94)",
          boxShadow: theme === "dark" ? "none" : `0 10px 30px rgba(17,17,17,0.12), 0 0 0 1px ${COLORS.border}`,
          whiteSpace: "nowrap",
          fontFamily: FONTS.display,
          fontWeight: 600,
          fontSize: size,
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
