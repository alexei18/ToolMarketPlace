import React from "react";
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from "remotion";
import { LOGO_CHECKS } from "../brand";
import type { Rect } from "../lib/types";
import { EASE_IN_OUT, progress } from "../motion";
import { BeatNode } from "./BeatNode";
import type { KitBeat } from "./scenes";
import { KIT, LAYOUT, TYPE } from "./tokens";

export interface MatchCutProps {
  durationInFrames: number;
  /** Shot A: rows of text, each with a check from the logo. */
  rows: string[];
  /** The row whose check becomes the object of shot B. */
  matchRow: number;
  /** Frame of the cut. */
  at: number;
  b: KitBeat;
  /** Where the same element stands in shot B on its first frame, video px. */
  to: Rect;
}

/** The first check of the logo alone: its box inside the logo's coordinates. */
const FIRST_CHECK_BOX = "2390.7 -1118 805.8 1118";
const CHECK_RATIO = 805.8 / 1118;
const TRAVEL = 14;
const ROW_H = 150;
const CHECK_H = 62;

const Check: React.FC<{ color?: string; style?: React.CSSProperties; height: number }> = ({ color = KIT.text, style, height }) => (
  <svg viewBox={FIRST_CHECK_BOX} width={height * CHECK_RATIO} height={height} style={style}>
    <path d={LOGO_CHECKS.first} fill={color} />
  </svg>
);

/** An element of shot A becomes the same element in shot B: the check leaves its list row, travels and lands where the object stands, on a hard cut. */
export const MatchCut: React.FC<MatchCutProps> = ({ durationInFrames, rows, matchRow, at, b, to }) => {
  const frame = useCurrentFrame();
  const top = 960 - (rows.length * ROW_H) / 2;
  const from: Rect = { x: LAYOUT.editorialX, y: top + matchRow * ROW_H + (ROW_H - CHECK_H) / 2, w: CHECK_H * CHECK_RATIO, h: CHECK_H };
  const p = progress(frame, at - TRAVEL, TRAVEL, EASE_IN_OUT);
  const speed = Math.abs(progress(frame + 1, at - TRAVEL, TRAVEL, EASE_IN_OUT) - p);
  const r = {
    x: interpolate(p, [0, 1], [from.x, to.x]),
    y: interpolate(p, [0, 1], [from.y, to.y]),
    h: interpolate(p, [0, 1], [from.h, to.h]),
  };
  if (frame >= at) {
    return (
      <Sequence from={at} durationInFrames={durationInFrames - at} layout="none">
        <BeatNode beat={b} durationInFrames={durationInFrames - at} />
      </Sequence>
    );
  }
  return (
    <AbsoluteFill>
      {rows.map((row, i) => (
        <div key={row} style={{ position: "absolute", left: LAYOUT.editorialX, top: top + i * ROW_H, height: ROW_H, display: "flex", alignItems: "center", gap: 36, opacity: i === matchRow ? 1 - p : (1 - p) * 0.55 }}>
          {i === matchRow ? <div style={{ width: CHECK_H * CHECK_RATIO }} /> : <Check height={CHECK_H} />}
          <div style={{ ...TYPE.headline, fontSize: 68, lineHeight: 1, color: KIT.text }}>{row}</div>
        </div>
      ))}
      <Check height={r.h} style={{ position: "absolute", left: r.x, top: r.y, filter: speed > 0.01 ? `blur(${Math.min(14, speed * 90)}px)` : undefined }} />
    </AbsoluteFill>
  );
};
