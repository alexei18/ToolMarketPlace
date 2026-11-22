import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { KIT } from "./tokens";

export interface StageShotProps {
  durationInFrames: number;
}

/** The Stage on its own: black, grain, vignette, drift, and one small green point pulsing like a notification. */
export const StageShot: React.FC<StageShotProps> = () => {
  const frame = useCurrentFrame();
  const pulse = interpolate(Math.sin((frame / 30) * Math.PI * 1.2), [-1, 1], [0, 1]);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", background: KIT.accent, boxShadow: `0 0 ${24 + pulse * 40}px ${6 + pulse * 10}px rgba(60,203,138,${0.25 + pulse * 0.3})` }} />
    </AbsoluteFill>
  );
};
