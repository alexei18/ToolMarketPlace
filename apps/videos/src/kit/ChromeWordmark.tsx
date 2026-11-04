import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import wordmarkSvg from "../../../../brand/tryworthy-logo/tryworthy-wordmark.svg";
import { progress } from "../motion";
import { ChromeMaterial, ChromeScene, Mirrored, useChromePieces } from "./three/ChromeScene";
import { KIT, TYPE } from "./tokens";

export interface ChromeWordmarkProps {
  durationInFrames: number;
  /** The light crosses the letters, starting on this frame. */
  sweepAt?: number;
  /** Written under the logo from `textAt`. */
  cta?: string;
  sub?: string;
  textAt?: number;
}

const SWEEP_FRAMES = 34;
/** The file is about 9 world units wide. */
const SCALE = 0.19;

const Letters: React.FC<{ spin: number; sweepAt: number }> = ({ spin, sweepAt }) => {
  const frame = useCurrentFrame();
  const pieces = useChromePieces(wordmarkSvg, 0.26, 0.03);
  const sweep = frame < sweepAt || frame > sweepAt + SWEEP_FRAMES ? null : interpolate(frame, [sweepAt, sweepAt + SWEEP_FRAMES], [-1.2, 1.3]);
  return (
    <Mirrored spin={spin}>
      {(reflection) => (
        <group scale={SCALE}>
          {pieces.map((p, i) => (
            <mesh key={i} geometry={p.geometry}>
              <ChromeMaterial green={p.green} sweep={sweep} reflection={reflection} soft />
            </mesh>
          ))}
        </group>
      )}
    </Mirrored>
  );
};

/** The final logo: the wordmark file's outlined paths in 3D chrome (never rebuilt from a font), with a light crossing the letters. */
export const ChromeWordmark: React.FC<ChromeWordmarkProps> = ({ durationInFrames, sweepAt = 12, cta, sub, textAt = 18 }) => {
  const frame = useCurrentFrame();
  const show = progress(frame, textAt, 14);
  return (
    <AbsoluteFill>
      <ChromeScene camera="logoPush" durationInFrames={durationInFrames}>
        {(spin) => <Letters spin={spin} sweepAt={sweepAt} />}
      </ChromeScene>
      {(cta || sub) && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 1150, textAlign: "center", opacity: show, transform: `translateY(${(1 - show) * 24}px)` }}>
          {cta && <div style={{ ...TYPE.headline, fontSize: 72, letterSpacing: "-0.03em", color: KIT.text }}>{cta}</div>}
          {sub && <div style={{ ...TYPE.hud, marginTop: 24 }}>{sub}</div>}
        </div>
      )}
    </AbsoluteFill>
  );
};
