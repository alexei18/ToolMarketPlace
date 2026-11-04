import { TransitionSeries, linearTiming, type TransitionPresentation, type TransitionPresentationComponentProps } from "@remotion/transitions";
import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { BeatNode } from "./BeatNode";
import type { KitBeat } from "./scenes";

export interface FocusPullProps {
  durationInFrames: number;
  a: KitBeat;
  b: KitBeat;
  /** Frame the pull starts. */
  at: number;
  /** Length of the pull. */
  frames?: number;
}

const MAX_BLUR = 40;

const Pull: React.FC<TransitionPresentationComponentProps<Record<string, never>>> = ({ children, presentationDirection, presentationProgress: p }) => {
  const exiting = presentationDirection === "exiting";
  const amount = exiting ? p : 1 - p;
  // The two sides swap in the middle, when both are too blurred to tell apart.
  const opacity = exiting ? interpolate(p, [0.4, 0.6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : interpolate(p, [0.4, 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ filter: `blur(${amount * MAX_BLUR}px)`, opacity, transform: `scale(${1 + amount * 0.04})` }}>{children}</AbsoluteFill>;
};

const focusPull = (): TransitionPresentation<Record<string, never>> => ({ component: Pull, props: {} });

/** Transition: everything goes through blur, 0 → 40 px, and comes out sharp as the next shot. */
export const FocusPull: React.FC<FocusPullProps> = ({ durationInFrames, a, b, at, frames = 16 }) => {
  const first = at + frames;
  const second = durationInFrames - at;
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={first}>
        <BeatNode beat={a} durationInFrames={first} />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={focusPull()} timing={linearTiming({ durationInFrames: frames })} />
      <TransitionSeries.Sequence durationInFrames={second}>
        <BeatNode beat={b} durationInFrames={second} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
