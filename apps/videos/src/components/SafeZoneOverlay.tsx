import React from "react";
import { AbsoluteFill } from "remotion";
import { CAPTION_BOXES, CENTER_X, CENTER_Y, DECOR, SAFE } from "../lib/layout";
import type { Rect } from "../lib/types";

const box = (r: Rect, style: React.CSSProperties) => <div style={{ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, boxSizing: "border-box", ...style }} />;
const label = (x: number, y: number, text: string, color: string) => (
  <div style={{ position: "absolute", left: x, top: y, font: "600 20px monospace", color, background: "rgba(255,255,255,0.75)", padding: "1px 5px" }}>{text}</div>
);

const RED = "rgba(220,38,38,0.30)";
const AMBER = "rgba(245,158,11,0.16)";

/**
 * Debug only (never in renders). Red: covered by TikTok or outside every zone. Amber: decoration
 * only (bezel, shadows), x 100–980 × y 200–1500. Dashed: the safe zone for critical text and the
 * UI the voice talks about, x 180–900 × y 260–1420. Magenta: the center line x = 540 every element
 * is centered on. Blue: caption boxes. Yellow: the beat's focus (what captions must not cover).
 */
export const SafeZoneOverlay: React.FC<{ focus?: Rect }> = ({ focus }) => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    {/* Outside the decoration zone. */}
    {box({ x: 0, y: 0, w: 1080, h: DECOR.y }, { background: RED })}
    {box({ x: 0, y: DECOR.y, w: DECOR.x, h: 1920 - DECOR.y }, { background: RED })}
    {box({ x: DECOR.x + DECOR.w, y: DECOR.y, w: 1080 - DECOR.x - DECOR.w, h: 1920 - DECOR.y }, { background: RED })}
    {box({ x: DECOR.x, y: DECOR.y + DECOR.h, w: DECOR.w, h: 1920 - DECOR.y - DECOR.h }, { background: RED })}
    {/* Decoration only (the strip under 1420 is covered by TikTok's caption: no content there). */}
    {box({ x: DECOR.x, y: SAFE.y + SAFE.h, w: DECOR.w, h: DECOR.y + DECOR.h - SAFE.y - SAFE.h }, { background: AMBER })}
    {box({ x: DECOR.x, y: DECOR.y, w: DECOR.w, h: SAFE.y - DECOR.y }, { background: AMBER })}
    {box({ x: DECOR.x, y: SAFE.y, w: SAFE.x - DECOR.x, h: SAFE.h }, { background: AMBER })}
    {box({ x: SAFE.x + SAFE.w, y: SAFE.y, w: DECOR.x + DECOR.w - SAFE.x - SAFE.w, h: SAFE.h }, { background: AMBER })}
    {box(DECOR, { border: "2px dotted rgba(245,158,11,0.95)" })}
    {box(SAFE, { border: "3px dashed rgba(220,38,38,0.95)" })}
    {box(CAPTION_BOXES.top, { border: "2px dotted rgba(37,99,235,0.85)" })}
    {box(CAPTION_BOXES.bottom, { border: "2px dotted rgba(37,99,235,0.85)" })}
    {/* Center lines. */}
    {box({ x: CENTER_X - 1, y: 0, w: 2, h: 1920 }, { background: "rgba(219,39,119,0.85)" })}
    {box({ x: SAFE.x, y: CENTER_Y - 1, w: SAFE.w, h: 2 }, { background: "rgba(219,39,119,0.45)" })}
    {focus && box(focus, { border: "4px solid rgba(234,179,8,0.95)" })}
    {label(SAFE.x + 6, SAFE.y + 6, "SAFE 180–900 × 260–1420", "rgba(185,28,28,1)")}
    {label(DECOR.x + 6, DECOR.y + 6, "DECOR 100–980 × 200–1500", "rgba(180,83,9,1)")}
    {label(CENTER_X + 8, 1430, "x 540", "rgba(190,24,93,1)")}
  </AbsoluteFill>
);
