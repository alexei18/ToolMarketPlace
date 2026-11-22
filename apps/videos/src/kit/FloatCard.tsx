import { noise2D } from "@remotion/noise";
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { useCapture } from "../captures";
import { progress } from "../motion";
import { CaptureView, cropScale, Illustrative } from "./CaptureView";

export interface FloatCardProps {
  durationInFrames: number;
  capture: string;
  /** The captured element shown. */
  target: string;
  state?: string;
}

const WIDTH = 720;

/** A real product card floating in the dark: it tilts slowly in 3D, with a reflection sliding across it. */
export const FloatCard: React.FC<FloatCardProps> = ({ capture, target, state, durationInFrames }) => {
  const frame = useCurrentFrame();
  const meta = useCapture(capture);
  const region = meta.targets[target]!;
  const height = region.h * cropScale(region, WIDTH);
  const enter = progress(frame, 0, 20);
  const rotY = noise2D("card-y", frame / 90, 0) * 7 + interpolate(enter, [0, 1], [-18, 0]);
  const rotX = noise2D("card-x", 0, frame / 110) * 5 + interpolate(enter, [0, 1], [10, 0]);
  const glare = interpolate(frame, [0, durationInFrames], [-30, 130]);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", perspective: 1500 }}>
      <div
        style={{
          position: "relative",
          width: WIDTH,
          height,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 80}px) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
          filter: "drop-shadow(0 50px 70px rgba(0,0,0,0.75)) brightness(0.93)",
        }}
      >
        <CaptureView capture={capture} region={region} width={WIDTH} {...(state ? { state } : {})} />
        <div style={{ position: "absolute", inset: 0, borderRadius: 18, background: `linear-gradient(105deg, rgba(255,255,255,0) ${glare - 18}%, rgba(255,255,255,0.5) ${glare}%, rgba(255,255,255,0) ${glare + 18}%)` }} />
        <Illustrative style={{ position: "absolute", left: 0, top: height + 26 }} />
      </div>
    </AbsoluteFill>
  );
};
