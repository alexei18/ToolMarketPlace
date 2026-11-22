import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import markSvg from "../../../../brand/tryworthy-logo/tryworthy-mark.svg";
import type { CameraPreset } from "./three/camera";
import { ChromeMaterial, ChromeScene, Mirrored, useChromePieces } from "./three/ChromeScene";

export interface ChromeMarkProps {
  camera: CameraPreset;
  durationInFrames: number;
  /** A band of light crosses the mark, starting on this frame. */
  sweepAt?: number;
}

const SWEEP_FRAMES = 30;

const Mark: React.FC<{ spin: number; sweepAt?: number }> = ({ spin, sweepAt }) => {
  const frame = useCurrentFrame();
  const pieces = useChromePieces(markSvg, 0.1, 0.085);
  const sweep = sweepAt === undefined || frame < sweepAt || frame > sweepAt + SWEEP_FRAMES ? null : interpolate(frame, [sweepAt, sweepAt + SWEEP_FRAMES], [-1.4, 2.2]);
  return (
    <Mirrored spin={spin}>
      {(reflection) =>
        pieces.map((p, i) => (
          <mesh key={i} geometry={p.geometry}>
            <ChromeMaterial green={p.green} sweep={sweep} reflection={reflection} />
          </mesh>
        ))
      }
    </Mirrored>
  );
};

/** The two checks of the logo, extruded in chrome on a mirror floor: left silver, right green-tinted. */
export const ChromeMark: React.FC<ChromeMarkProps> = ({ camera, durationInFrames, sweepAt }) => (
  <ChromeScene camera={camera} durationInFrames={durationInFrames}>
    {(spin) => <Mark spin={spin} {...(sweepAt !== undefined ? { sweepAt } : {})} />}
  </ChromeScene>
);
