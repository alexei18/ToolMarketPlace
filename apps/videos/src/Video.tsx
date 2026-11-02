import React, { useMemo } from "react";
import { AbsoluteFill, Html5Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { themeColors } from "./brand";
import { CapturesContext, type CaptureMeta } from "./captures";
import { Captions } from "./components/Captions";
import { SafeZoneOverlay } from "./components/SafeZoneOverlay";
import { BeatContext } from "./context";
import { captionPages } from "./lib/captions";
import { buildTimeline, FPS } from "./lib/timeline";
import type { VideoSpec, Word } from "./lib/types";
import { Endscreen } from "./scenes/Endscreen";
import { SCENES } from "./scenes";
import { captionBand, showsCaptions } from "./scenes/names";
import { beatFocus } from "./lib/stage";

export interface VideoProps {
  spec: VideoSpec;
  words: Word[];
  captures: Record<string, CaptureMeta>;
  /** Studio only: the TikTok safe zone, caption boxes and focus areas. Always false in renders. */
  debugSafeZone: boolean;
  [key: string]: unknown;
}

/** One TikTok video: the beats on their cue frames, captions, the cleaned voice, then the endscreen. No music. */
export const Video: React.FC<VideoProps> = ({ spec, words, captures, debugSafeZone }) => {
  const tl = useMemo(() => buildTimeline(spec, words, FPS), [spec, words]);
  const pages = useMemo(() => captionPages(words, tl, spec.style.keywords, FPS), [words, tl, spec.style.keywords]);
  const frame = useCurrentFrame();
  const colors = themeColors(spec.style.theme);
  const band = captionBand(spec);
  const shown = (beat: number) => showsCaptions(tl.beats[beat]!);
  const current = tl.beats.find((b) => frame >= b.from && frame < b.from + b.durationInFrames);

  return (
    <CapturesContext.Provider value={captures}>
      <AbsoluteFill style={{ backgroundColor: colors.bg }}>
        {tl.beats.map((b, i) => {
          const Scene = SCENES[b.scene];
          const next = tl.beats[i + 1];
          return (
            <Sequence key={i} from={b.from} durationInFrames={b.durationInFrames} name={`${i + 1}. ${b.scene} @ "${b.cue}"`}>
              <BeatContext.Provider
                value={{ words, theme: spec.style.theme, keywords: spec.style.keywords ?? [], beatFrom: b.from, cueFrame: b.cueFrame, wordRange: [b.cueIndex, next ? next.cueIndex : words.length] }}
              >
                <Scene {...(b.props ?? {})} />
              </BeatContext.Provider>
            </Sequence>
          );
        })}
        <Sequence from={tl.endscreenFrom} durationInFrames={tl.endscreenFrames} name="Endscreen">
          <Endscreen variant={spec.endscreen} />
        </Sequence>
        <Sequence from={0} durationInFrames={tl.voiceEndFrame} name="Captions">
          <Captions pages={pages} band={band} shown={shown} theme={spec.style.theme} />
        </Sequence>
        <Html5Audio src={staticFile(`vo/${spec.id}.wav`)} />
        {debugSafeZone && <SafeZoneOverlay band={band} focus={current ? beatFocus(current, captures) : undefined} />}
      </AbsoluteFill>
    </CapturesContext.Provider>
  );
};
