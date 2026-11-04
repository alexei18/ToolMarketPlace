import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { useCapture } from "../captures";
import { EASE_IN_OUT, progress } from "../motion";
import { CaptureView, Illustrative } from "./CaptureView";
import { KIT } from "./tokens";

export interface WireframeCollapseProps {
  durationInFrames: number;
  capture: string;
  /** The capture's list of boxes (real elements of the page). */
  boxes: string;
  /** The elements start turning into skeleton boxes on this frame. */
  breakAt: number;
  /** All boxes start closing into one square on this frame. */
  collapseAt: number;
}

export const WIREFRAME = {
  /** The page, 720 px wide, centered. */
  width: 720,
  x: 180,
  y: 260,
  /** CSS px of the page shown. */
  pageHeight: 650,
  /** Frames between one element and the next. */
  stagger: 1.5,
  /** The final square. */
  square: 150,
};

/** Turns the real page element by element into skeleton boxes, then closes everything into one square. */
export const WireframeCollapse: React.FC<WireframeCollapseProps> = ({ capture, boxes, breakAt, collapseAt }) => {
  const frame = useCurrentFrame();
  const meta = useCapture(capture);
  const s = WIREFRAME.width / meta.width;
  const items = useMemo(() => (meta.boxes?.[boxes] ?? []).filter((b) => b.y < WIREFRAME.pageHeight).sort((a, b) => a.y - b.y), [meta, boxes]);
  const pageOpacity = 1 - progress(frame, breakAt + items.length * WIREFRAME.stagger - 4, 14);
  const cx = 540;
  const cy = WIREFRAME.y + (WIREFRAME.pageHeight * s) / 2;

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: WIREFRAME.x, top: WIREFRAME.y, opacity: pageOpacity }}>
        <CaptureView capture={capture} region={{ x: 0, y: 0, w: meta.width, h: WIREFRAME.pageHeight }} width={WIREFRAME.width} />
      </div>
      {items.map((b, i) => {
        const on = frame >= breakAt + i * WIREFRAME.stagger;
        if (!on) return null;
        const c = progress(frame, collapseAt + (items.length - i) * 0.35, 18, EASE_IN_OUT);
        const x = WIREFRAME.x + b.x * s;
        const y = WIREFRAME.y + b.y * s;
        const w = b.w * s;
        const h = b.h * s;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: interpolate(c, [0, 1], [x, cx - WIREFRAME.square / 2]),
              top: interpolate(c, [0, 1], [y, cy - WIREFRAME.square / 2]),
              width: interpolate(c, [0, 1], [w, WIREFRAME.square]),
              height: interpolate(c, [0, 1], [h, WIREFRAME.square]),
              border: `2px solid ${KIT.text}`,
              borderRadius: interpolate(c, [0, 1], [6, 18]),
              background: KIT.bg,
            }}
          />
        );
      })}
      <Illustrative style={{ position: "absolute", left: WIREFRAME.x, top: WIREFRAME.y + WIREFRAME.pageHeight * s + 24, opacity: pageOpacity }} />
    </AbsoluteFill>
  );
};
