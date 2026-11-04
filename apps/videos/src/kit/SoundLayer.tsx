import { Audio } from "@remotion/media";
import React from "react";
import { Sequence, staticFile, useVideoConfig } from "remotion";
import manifest from "../../public/sfx/manifest.json";
import type { Cue, CueType } from "./cues";

interface Sound {
  files: string[];
  seconds: number;
  gainDb: number;
  source: string;
  license: string;
}
const SOUNDS = manifest as Record<CueType, Sound>;

const db = (d: number) => Math.pow(10, d / 20);

/** Plays the cue list: maps each cue type to its file in public/sfx (manifest.json has the sources and licenses). */
export const SoundLayer: React.FC<{ cues: Cue[] }> = ({ cues }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {cues.map((c, i) => {
        const sound = SOUNDS[c.type];
        // Variants take turns by frame, so the same video always plays the same one.
        const file = sound.files[c.frame % sound.files.length]!;
        const frames = c.loopFrames ?? Math.ceil(sound.seconds * fps);
        return (
          <Sequence key={i} from={c.frame} durationInFrames={frames} layout="none" name={`${c.type} @${c.frame}`}>
            <Audio src={staticFile(`sfx/${file}`)} volume={db(sound.gainDb + (c.gainDb ?? 0))} loop={c.loopFrames !== undefined} />
          </Sequence>
        );
      })}
    </>
  );
};
