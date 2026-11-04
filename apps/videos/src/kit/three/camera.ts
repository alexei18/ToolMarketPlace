/*
 * Camera presets for the chrome scenes: pure functions of the shot's progress, so any frame renders
 * the same on its own. World units: the mark stands on the floor (y = 0), about 1.26 high.
 */
import { Easing, interpolate } from "remotion";

export type CameraPreset = "macroGlide" | "slowOrbit" | "pushIn" | "revealSpin";

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  /** Rotation of the object around y, in radians. */
  spin: number;
  /** Distance from the camera to the target, for the focus. */
  focus: number;
}

const EXPO_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

export function cameraPose(preset: CameraPreset, t: number): CameraPose {
  let position: [number, number, number];
  let target: [number, number, number];
  let fov = 30;
  let spin = 0;
  switch (preset) {
    case "macroGlide": {
      // Very close, sliding along the edge of the first check.
      const x = interpolate(t, [0, 1], [-0.56, -0.16]);
      position = [x - 0.25, 0.42, 1.9];
      target = [x + 0.1, 0.5, 0];
      fov = 24;
      break;
    }
    case "slowOrbit": {
      const a = interpolate(t, [0, 1], [-0.42, 0.42]);
      position = [Math.sin(a) * 8.2, 1.25, Math.cos(a) * 8.2];
      target = [0, 0.56, 0];
      break;
    }
    case "pushIn": {
      const z = interpolate(EXPO_OUT(t), [0, 1], [10.5, 7.2]);
      position = [0.12, 1.1, z];
      target = [0, 0.58, 0];
      break;
    }
    case "revealSpin": {
      spin = interpolate(EXPO_OUT(t), [0, 1], [-Math.PI * 1.5, 0]);
      const z = interpolate(t, [0, 1], [8.8, 8.2]);
      position = [0, 1.1, z];
      target = [0, 0.58, 0];
      break;
    }
  }
  return { position, target, fov, spin, focus: dist(position, target) };
}
