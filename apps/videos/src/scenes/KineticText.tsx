import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { FONTS, themeColors } from "../brand";
import { spokenTimes, useBeat } from "../context";
import { fitKinetic } from "../lib/kinetic";
import { TEXT_BLOCK } from "../lib/stage";
import { normalizeWord } from "../lib/words";
import { EASE_IN_OUT, progress } from "../motion";

export interface KineticTextProps {
  /** Lines of on-screen text, centered; each word appears on the frame it is spoken. */
  lines: string[];
  /** slam: words punch in; typewriter: letters type out over the spoken word; highlight: the text is there, highlighted words get a marker as they are said. */
  mode?: "slam" | "typewriter" | "highlight";
  /** Words drawn in the accent color (and marked, in highlight mode). Defaults to the spec's keywords. */
  highlight?: string[];
  /** Font size in px. */
  size?: number;
}

const LINE_HEIGHT = 1.06;

/*
 * Center-aligned text, the block centered on x = 540 and on the middle of the safe band (y 840).
 * In slam and typewriter modes a line appears with its first spoken word and the block eases so
 * the lines shown so far stay centered: the first word lands in the middle of the frame, not at
 * the top of an empty block.
 */
export const KineticText: React.FC<KineticTextProps> = ({ lines, mode = "slam", highlight, size: wanted = 108 }) => {
  const ctx = useBeat();
  // The lines are kept as written; the type shrinks until the widest one fits the column.
  const fitted = fitKinetic(lines, wanted);
  const size = fitted.size;
  const colors = themeColors(ctx.theme);
  const keys = new Set((highlight ?? ctx.keywords).map(normalizeWord));
  const words = lines.map((l) => l.split(/\s+/).filter(Boolean));
  const times = spokenTimes(ctx, ctx.fps, words.flat());
  const f = ctx.absFrame;

  const lineStarts: number[] = [];
  let k = 0;
  for (const line of words) {
    lineStarts.push(times[k]![0]);
    k += line.length;
  }
  const lineH = size * LINE_HEIGHT;
  const shown = mode === "highlight" ? lines.length : lineStarts.reduce((n, at) => n + progress(f, at - 2, 8, EASE_IN_OUT), 0);
  const shift = ((lines.length - shown) * lineH) / 2;
  let n = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      <div
        style={{
          position: "absolute",
          left: TEXT_BLOCK.x,
          top: TEXT_BLOCK.y,
          width: TEXT_BLOCK.w,
          height: TEXT_BLOCK.h,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          fontFamily: FONTS.display,
          fontWeight: 800,
          fontSize: size,
          lineHeight: LINE_HEIGHT,
          letterSpacing: "-0.01em",
          color: colors.text,
          transform: `translateY(${shift}px)`,
        }}
      >
        {words.map((line, li) => (
          <div key={li} style={{ display: "flex", flexWrap: fitted.fits ? "nowrap" : "wrap", justifyContent: "center" }}>
            {line.map((w, wi) => {
              const [start, end] = times[n++]!;
              const isKey = keys.has(normalizeWord(w));
              // A word takes its place in the line as it lands (slam) or starts typing, so a half-said
              // line stays centered; a highlight line is all there from the start.
              const grow = mode === "slam" ? progress(f, start, 5) : mode === "typewriter" ? (f >= start ? 1 : 0) : 1;
              return (
                <span key={wi} style={{ display: "inline-block", whiteSpace: "nowrap", maxWidth: mode === "slam" ? `${grow * w.length * 0.8}em` : undefined, marginLeft: wi > 0 ? grow * size * 0.24 : 0 }}>
                  <KWord word={w} mode={mode} isKey={isKey} start={start} end={end} frame={f} accent={colors.accent} size={size} />
                </span>
              );
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
    // Typing finishes a little before the word does, so the line is complete when the voice moves on.
    const span = Math.max(3, Math.min(Math.floor((end - start) * 0.8), chars.length * 2));
    const shown = Math.floor(interpolate(frame, [start, start + span], [0, chars.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
    return (
      // Only the typed letters take space, so the line stays centered while it types.
      <span style={{ color, whiteSpace: "pre" }}>{chars.slice(0, shown).join("")}</span>
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
        transformOrigin: "50% 55%",
      }}
    >
      {word}
    </span>
  );
};
