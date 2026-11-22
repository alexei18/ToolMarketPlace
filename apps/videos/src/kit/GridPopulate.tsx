import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { FONTS } from "../brand";
import { progress } from "../motion";
import { KIT } from "./tokens";

export interface GridPopulateProps {
  durationInFrames: number;
  items: string[];
  /** The one that stays and turns green. */
  keep: number;
  /** Frames between one item and the next. */
  stagger?: number;
  /** Everything but `keep` goes out on this frame. */
  fadeAt: number;
}

export const GRID_STAGGER = 3;
const COLUMNS = 2;
const CELL = { w: 396, h: 92, gap: 16 };

/** A grid filling up item by item, then everything goes out but one. */
export const GridPopulate: React.FC<GridPopulateProps> = ({ items, keep, stagger = GRID_STAGGER, fadeAt }) => {
  const frame = useCurrentFrame();
  const out = progress(frame, fadeAt, 16);
  const rows = Math.ceil(items.length / COLUMNS);
  const left = 540 - (COLUMNS * CELL.w + (COLUMNS - 1) * CELL.gap) / 2;
  const top = 840 - (rows * CELL.h + (rows - 1) * CELL.gap) / 2;
  return (
    <AbsoluteFill>
      {items.map((item, i) => {
        const at = i * stagger;
        const p = progress(frame, at, 8);
        const isKept = i === keep;
        const opacity = frame < at ? 0 : isKept ? p : p * (1 - out * 0.96);
        return (
          <div
            key={item}
            style={{
              position: "absolute",
              left: left + (i % COLUMNS) * (CELL.w + CELL.gap),
              top: top + Math.floor(i / COLUMNS) * (CELL.h + CELL.gap),
              width: CELL.w,
              height: CELL.h,
              display: "flex",
              alignItems: "center",
              paddingLeft: 28,
              boxSizing: "border-box",
              borderRadius: 14,
              border: `2px solid ${isKept && out > 0 ? KIT.accent : "rgba(245,245,243,0.18)"}`,
              background: isKept && out > 0 ? `rgba(60,203,138,${0.16 * out})` : "rgba(245,245,243,0.04)",
              fontFamily: FONTS.display,
              fontWeight: 600,
              fontSize: 36,
              color: isKept && out > 0 ? KIT.accent : KIT.text,
              opacity,
              transform: `scale(${interpolate(p, [0, 1], [0.92, 1])})`,
            }}
          >
            {item}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
