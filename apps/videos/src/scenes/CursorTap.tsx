import React from "react";
import { interpolate } from "remotion";
import { COLORS } from "../brand";
import { EASE_IN_OUT, progress } from "../motion";

export interface CursorStop {
  /** Position in the parent's coordinate space (px). */
  x: number;
  y: number;
  /** Absolute frame the cursor must be there; a tap happens on this frame when `tap` is set. */
  at: number;
  tap?: boolean;
}

/**
 * An arrow cursor that glides between stops (arriving on each stop's frame) and taps with a press
 * and a ring. Render it on top of the UI it points at, in the same coordinate space.
 */
export const CursorTap: React.FC<{ stops: CursorStop[]; frame: number; size?: number; travel?: number }> = ({ stops, frame, size = 64, travel = 14 }) => {
  if (stops.length === 0) return null;
  const first = stops[0]!;
  let x = first.x;
  let y = first.y;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!;
    const b = stops[i]!;
    const p = progress(frame, b.at - travel, travel, EASE_IN_OUT);
    if (p > 0) {
      x = interpolate(p, [0, 1], [a.x, b.x]);
      y = interpolate(p, [0, 1], [a.y, b.y]);
    }
  }
  const appear = progress(frame, first.at - 8, 8);
  // The press: down over 3 frames on the tap frame, back up over 5.
  const tap = stops.find((s) => s.tap && frame >= s.at - 3 && frame < s.at + 18);
  const press = tap ? interpolate(frame, [tap.at - 3, tap.at, tap.at + 5], [1, 0.82, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  const ring = tap ? progress(frame, tap.at, 16) : 0;

  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, opacity: appear, pointerEvents: "none" }}>
      {tap && (
        <div
          style={{
            position: "absolute",
            left: tap.x - 60,
            top: tap.y - 60,
            width: 120,
            height: 120,
            borderRadius: "50%",
            border: `5px solid ${COLORS.accent}`,
            opacity: 1 - ring,
            transform: `scale(${0.3 + ring * 0.9})`,
          }}
        />
      )}
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        // The arrow's tip (4.5, 2.5 in the 24-unit viewBox) sits exactly on (x, y).
        style={{ position: "absolute", left: x - size * 0.1875, top: y - size * 0.104, transform: `scale(${press})`, transformOrigin: "18.75% 10.4%", filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.28))" }}
      >
        <path d="M4.5 2.5 L4.5 19 L9 14.8 L12.2 21.5 L15 20.2 L11.9 13.6 L18.2 13.6 Z" fill={COLORS.ink} stroke="#FFFFFF" strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
    </div>
  );
};
