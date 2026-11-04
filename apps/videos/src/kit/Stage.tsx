import { noise2D } from "@remotion/noise";
import React, { useMemo } from "react";
import { AbsoluteFill, getInputProps, random, useCurrentFrame } from "remotion";
import { KIT } from "./tokens";

export interface StageProps {
  children?: React.ReactNode;
  /** Slow camera on the children, 2–4% over the shot. 3D scenes pass false: their camera moves on its own. */
  drift?: boolean;
  /** Seeds the drift and the grain, so two shots don't move alike. */
  seed?: string;
  /** The shot's length, for the drift and the room tone. */
  durationInFrames: number;
  /** Grain opacity, 3–5%. */
  grain?: number;
}

const TILE = 512;
let tileUrl: string | null = null;

/** One seeded noise tile, made once: per-pixel noise on 2 million pixels a frame would dominate the render. */
function grainTile(): string {
  if (tileUrl) return tileUrl;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TILE;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(TILE, TILE);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = Math.round(random(`grain-${i}`) * 255);
  }
  ctx.putImageData(img, 0, 0);
  tileUrl = canvas.toDataURL("image/png");
  return tileUrl;
}

/** The frame-checking render (video-check) turns the grain off: it would make every frame differ. */
const grainOff = () => Boolean((getInputProps() as { noGrain?: boolean }).noGrain);

/** A slow, seeded camera move: never zero, even on a "static" shot. */
export function driftAt(frame: number, duration: number, seed: string) {
  const t = duration > 1 ? frame / (duration - 1) : 0;
  return {
    scale: 1.01 + 0.03 * t,
    x: noise2D(`${seed}-x`, frame / 240, 0) * 14,
    y: noise2D(`${seed}-y`, 0, frame / 240) * 14,
  };
}

/** The common stage: #0A0A0A, animated seeded grain, a light vignette and a slow camera drift. */
export const Stage: React.FC<StageProps> = ({ children, drift = true, seed = "stage", durationInFrames, grain = 0.04 }) => {
  const frame = useCurrentFrame();
  const move = drift ? driftAt(frame, durationInFrames, seed) : null;
  const tile = useMemo(() => (grainOff() ? null : grainTile()), []);
  // Behind 2D content, or it dirties the white UI; on top of a 3D scene (no drift), which fills the frame.
  const vignette = <AbsoluteFill style={{ background: "radial-gradient(ellipse 85% 70% at 50% 46%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)", pointerEvents: "none" }} />;
  return (
    <AbsoluteFill style={{ backgroundColor: KIT.bg, overflow: "hidden" }}>
      {drift && vignette}
      <AbsoluteFill style={move ? { transform: `translate(${move.x}px, ${move.y}px) scale(${move.scale})` } : undefined}>{children}</AbsoluteFill>
      {!drift && vignette}
      {tile && (
        <AbsoluteFill
          style={{
            backgroundImage: `url(${tile})`,
            backgroundPosition: `${Math.floor(random(`gx-${seed}-${frame}`) * TILE)}px ${Math.floor(random(`gy-${seed}-${frame}`) * TILE)}px`,
            opacity: grain,
            pointerEvents: "none",
          }}
        />
      )}
    </AbsoluteFill>
  );
};
