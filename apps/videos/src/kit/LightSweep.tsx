import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { BeatNode } from "./BeatNode";
import type { KitBeat } from "./scenes";
import { KIT } from "./tokens";

export interface LightSweepProps {
  durationInFrames: number;
  /** What the light crosses. Chrome has its own band in the 3D scene (ChromeMark's sweepAt). */
  over: KitBeat;
  at: number;
  /** Frames to cross the frame. */
  duration?: number;
  angle?: number;
}

/**
 * A band of light crossing whatever is under it. Color dodge multiplies what's there, so the near
 * black stage stays near black and the band shows on the object. A gray band, not white: white would
 * dodge anything above zero to pure white, the stage included. The backdrop here must be opaque:
 * the Stage's transform isolates this group, and dodge over nothing just paints the band.
 */
export const LightSweep: React.FC<LightSweepProps> = ({ durationInFrames, over, at, duration = 30, angle = 108 }) => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [at, at + duration], [-60, 160], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: KIT.bg }}>
      <BeatNode beat={over} durationInFrames={durationInFrames} />
      {frame >= at && frame <= at + duration && (
        <AbsoluteFill
          style={{
            mixBlendMode: "color-dodge",
            background: `linear-gradient(${angle}deg, #000 ${x - 16}%, #555 ${x - 5}%, #a0a0a0 ${x}%, #555 ${x + 5}%, #000 ${x + 16}%)`,
          }}
        />
      )}
    </AbsoluteFill>
  );
};
