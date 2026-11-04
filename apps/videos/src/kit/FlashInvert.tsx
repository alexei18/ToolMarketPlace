import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { BeatNode } from "./BeatNode";
import type { KitBeat } from "./scenes";

export interface FlashInvertProps {
  durationInFrames: number;
  a: KitBeat;
  b: KitBeat;
  /** The twist's frame. */
  at: number;
  /** The white flash, 2–4 frames. */
  flashFrames?: number;
  /** Shot B plays inverted for this many frames after the flash. */
  invertFrames?: number;
}

/** A white flash of 2–4 frames at the twist, then the next shot inverted for a moment. */
export const FlashInvert: React.FC<FlashInvertProps> = ({ durationInFrames, a, b, at, flashFrames = 3, invertFrames = 10 }) => {
  const frame = useCurrentFrame();
  const inverted = frame >= at + flashFrames && frame < at + flashFrames + invertFrames;
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={at} layout="none">
        <BeatNode beat={a} durationInFrames={at} />
      </Sequence>
      <Sequence from={at} durationInFrames={durationInFrames - at} layout="none">
        <AbsoluteFill style={{ filter: inverted ? "invert(1)" : undefined, background: inverted ? "#0A0A0A" : undefined }}>
          <BeatNode beat={b} durationInFrames={durationInFrames - at} />
        </AbsoluteFill>
      </Sequence>
      {frame >= at && frame < at + flashFrames && <AbsoluteFill style={{ background: "#fff" }} />}
    </AbsoluteFill>
  );
};
