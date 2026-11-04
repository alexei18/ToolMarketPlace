import React from "react";
import { Img, staticFile } from "remotion";
import { useCapture } from "../captures";
import type { Rect } from "../lib/types";

/** Video px per CSS px for a region shown `width` px wide. */
export const cropScale = (region: Rect, width: number) => width / region.w;

/**
 * A region of a real capture, `width` video px wide, positioned by its parent. The pixels are the
 * page's own; the page is never rebuilt.
 */
export const CaptureView: React.FC<{ capture: string; region: Rect; width: number; state?: string; radius?: number; style?: React.CSSProperties }> = ({ capture, region, width, state = "default", radius = 18, style }) => {
  const meta = useCapture(capture);
  const s = cropScale(region, width);
  return (
    <div style={{ width, height: region.h * s, overflow: "hidden", borderRadius: radius, background: "#fff", ...style }}>
      <Img
        src={staticFile(meta.states[state] ?? meta.states.default!)}
        style={{ display: "block", width: meta.width * s, height: meta.height * s, maxWidth: "none", transform: `translate(${-region.x * s}px, ${-region.y * s}px)` }}
      />
    </div>
  );
};

/** Demo products are fictional, so a real capture on screen carries this. */
export const Illustrative: React.FC<{ style?: React.CSSProperties }> = ({ style }) => <div style={{ fontFamily: "JetBrains Mono", fontWeight: 500, fontSize: 20, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(245,245,243,0.45)", ...style }}>Illustrative</div>;
