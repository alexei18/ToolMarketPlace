import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { FONTS, themeColors } from "../brand";
import { spokenTimes, useBeat } from "../context";
import { SAFE } from "../lib/layout";
import { normalizeWord } from "../lib/words";
import { progress } from "../motion";

export interface KineticTextProps {
  /** Lines of on-screen text; each word appears on the frame it is spoken. */
  lines: string[];
  /** slam: words punch in; typewriter: letters type out over the spoken word; highlight: the text is there, highlighted words get a marker as they are said. */
  mode?: "slam" | "typewriter" | "highlight";
  /** Words drawn in the accent color (and marked, in highlight mode). Defaults to the spec's keywords. */
  highlight?: string[];
  /** Font size in px. */
  size?: number;
  align?: "left" | "center";
  /** Vertical placement inside the safe zone. */
  position?: "top" | "center";
}

export const KineticText: React.FC<KineticTextProps> = ({ lines, mode = "slam", highlight, size = 108, align = "left", position = "center" }) => {
  const ctx = useBeat();
  const colors = themeColors(ctx.theme);
  const keys = new Set((highlight ?? ctx.keywords).map(normalizeWord));
  const words = lines.map((l) => l.split(/\s+/).filter(Boolean));
  const times = spokenTimes(ctx, ctx.fps, words.flat());
  let n = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      <div
        style={{
          position: "absolute",
          left: SAFE.x,
          width: SAFE.w,
          top: position === "top" ? SAFE.y + 40 : SAFE.y,
          height: position === "top" ? undefined : SAFE.h,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: align === "center" ? "center" : "flex-start",
          textAlign: align,
          fontFamily: FONTS.display,
          fontWeight: 800,
          fontSize: size,
          lineHeight: 1.02,
          letterSpacing: "-0.02em",
          color: colors.text,
        }}
      >
        {words.map((line, li) => (
          <div key={li} style={{ display: "flex", flexWrap: "wrap", gap: `0 ${size * 0.26}px`, justifyContent: align === "center" ? "center" : "flex-start" }}>
            {line.map((w, wi) => {
              const [start, end] = times[n++]!;
              const local = ctx.absFrame;
              const isKey = keys.has(normalizeWord(w));
              return <KWord key={wi} word={w} mode={mode} isKey={isKey} start={start} end={end} frame={local} accent={colors.accent} size={size} />;
            })}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const KWord: React.FC<{ word: string; mode: NonNullable<KineticTextProps["mode"]>; isKey: boolean; start: number; end: number; frame: number; accent: string; size: number }> = ({
  word,
  mode,
  isKey,
  start,
  end,
  frame,
  accent,
  size,
}) => {
  const color = isKey ? accent : undefined;
  if (mode === "typewriter") {
    const chars = [...word];
    const span = Math.max(3, Math.min(end - start, chars.length * 2));
    const shown = Math.floor(interpolate(frame, [start, start + span], [0, chars.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
    return (
      <span style={{ color, whiteSpace: "pre" }}>
        <span>{chars.slice(0, shown).join("")}</span>
        <span style={{ opacity: 0 }}>{chars.slice(shown).join("")}</span>
      </span>
    );
  }
  if (mode === "highlight") {
    const p = isKey ? progress(frame, start, Math.max(6, end - start)) : 0;
    return (
      <span style={{ position: "relative", whiteSpace: "pre" }}>
        {isKey && (
          <span
            style={{
              position: "absolute",
              left: -size * 0.06,
              right: -size * 0.06,
              top: "18%",
              bottom: "6%",
              background: accent,
              opacity: 0.22,
              borderRadius: size * 0.08,
              transformOrigin: "left center",
              transform: `scaleX(${p})`,
            }}
          />
        )}
        <span style={{ position: "relative", color: p > 0.5 ? accent : undefined }}>{word}</span>
      </span>
    );
  }
  // slam: punches in from a larger size on its spoken frame.
  const p = progress(frame, start, 7);
  return (
    <span
      style={{
        display: "inline-block",
        whiteSpace: "pre",
        color,
        opacity: interpolate(frame, [start, start + 2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        transform: `scale(${interpolate(p, [0, 1], [1.45, 1])})`,
        transformOrigin: "50% 60%",
      }}
    >
      {word}
    </span>
  );
};
