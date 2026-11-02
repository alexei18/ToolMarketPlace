import React from "react";
import { AbsoluteFill } from "remotion";
import { CAPTION_BOXES, SAFE } from "../lib/layout";
import type { Rect } from "../lib/types";

const box = (r: Rect, style: React.CSSProperties) => <div style={{ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, ...style }} />;

/**
 * Debug only (never in renders): TikTok's covered areas in red, the safe zone, the caption boxes,
 * and the beat's focus rectangle (what captions must not cover).
 */
export const SafeZoneOverlay: React.FC<{ focus?: Rect }> = ({ focus }) => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    {box({ x: 0, y: 1420, w: 1080, h: 500 }, { background: "rgba(220,38,38,0.28)" })}
    {box({ x: 860, y: 0, w: 220, h: 1420 }, { background: "rgba(220,38,38,0.28)" })}
    {box({ x: 0, y: 0, w: 860, h: 260 }, { background: "rgba(220,38,38,0.14)" })}
    {box({ x: 0, y: 260, w: 120, h: 1160 }, { background: "rgba(220,38,38,0.14)" })}
    {box(SAFE, { border: "3px dashed rgba(220,38,38,0.9)" })}
    {box(CAPTION_BOXES.top, { border: "2px dotted rgba(37,99,235,0.8)" })}
    {box(CAPTION_BOXES.bottom, { border: "2px dotted rgba(37,99,235,0.8)" })}
    {focus && box(focus, { border: "4px solid rgba(234,179,8,0.95)" })}
    <div style={{ position: "absolute", left: SAFE.x + 8, top: SAFE.y + 6, font: "600 22px monospace", color: "rgba(220,38,38,0.9)" }}>SAFE ZONE 120–860 × 260–1420</div>
  </AbsoluteFill>
);
