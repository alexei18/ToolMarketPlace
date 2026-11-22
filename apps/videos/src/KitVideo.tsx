import { Audio } from "@remotion/media";
import React, { useMemo } from "react";
import { Sequence, staticFile } from "remotion";
import { CapturesContext, type CaptureMeta } from "./captures";
import { BeatNode } from "./kit/BeatNode";
import { KaraokeCaption } from "./kit/KaraokeCaption";
import { MusicBed } from "./kit/MusicBed";
import { SoundLayer } from "./kit/SoundLayer";
import { Stage } from "./kit/Stage";
import { buildKitTimeline, type MusicAnalysis } from "./lib/kit-timeline";
import { FPS } from "./lib/timeline";
import type { VideoSpec, Word } from "./lib/types";

export interface KitVideoProps {
  spec: VideoSpec;
  words: Word[];
  music: MusicAnalysis;
  captures: Record<string, CaptureMeta>;
  [key: string]: unknown;
}

/** A motion-kit video: beats on the Stage, voice for act 1 and the CTA, the music from the drop on, every sound cue. */
export const KitVideo: React.FC<KitVideoProps> = ({ spec, words, music, captures }) => {
  const tl = useMemo(() => buildKitTimeline(spec.id, spec.kit!, words, music, FPS), [spec, words, music]);
  const voice = staticFile(`vo/${spec.id}.wav`);
  return (
    <CapturesContext.Provider value={captures}>
      {tl.beats.map((b) => (
        <Sequence key={b.index} from={b.from} durationInFrames={b.durationInFrames} name={`${b.index + 1}. ${b.beat.scene}`}>
          <Stage durationInFrames={b.durationInFrames} seed={`${spec.id}-${b.index}`} drift={b.spec.stage?.drift ?? true}>
            <BeatNode beat={b.beat} durationInFrames={b.durationInFrames} />
          </Stage>
          {b.captionWords && b.captionWords.length > 0 && <KaraokeCaption durationInFrames={b.durationInFrames} words={b.captionWords} />}
        </Sequence>
      ))}
      <Sequence durationInFrames={tl.voice.act1Frames} layout="none" name="Voice: act 1">
        <Audio src={voice} />
      </Sequence>
      <Sequence from={tl.voice.cta.from} durationInFrames={tl.voice.cta.frames} layout="none" name="Voice: CTA">
        <Audio src={voice} trimBefore={tl.voice.cta.trimBefore} />
      </Sequence>
      <MusicBed src={spec.kit!.music} music={tl.music} />
      <SoundLayer cues={tl.cues} />
    </CapturesContext.Provider>
  );
};
