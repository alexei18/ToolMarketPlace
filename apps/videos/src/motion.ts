import { Easing, interpolate } from "remotion";

/** Smooth, long-tail settle. Used for every entrance; nothing bounces. */
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

/** 0→1 over `duration` frames starting at `start`, eased, clamped. */
export function progress(frame: number, start: number, duration: number, easing = EASE_OUT): number {
  return interpolate(frame, [start, start + duration], [0, 1], { easing, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

/** A well-damped spring config: settles without overshoot you can see. */
export const SPRING_SETTLE = { damping: 22, stiffness: 140, mass: 0.9 } as const;
