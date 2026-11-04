import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { KIT, LAYOUT, TYPE } from "./tokens";

export interface KaraokeCaptionProps {
  durationInFrames: number;
  /** Spoken words, in frames. */
  words: { word: string; from: number; to: number }[];
  /** Pages of 2–4 words. */
  maxWords?: number;
}

/** The fine caption: small and white, no background; the spoken word goes from 30% to 100%. */
export const KaraokeCaption: React.FC<KaraokeCaptionProps> = ({ words, maxWords = 4 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pages = useMemo(() => {
    const captions: Caption[] = words.map((w, i) => ({ text: `${i ? " " : ""}${w.word}`, startMs: (w.from / fps) * 1000, endMs: (w.to / fps) * 1000, timestampMs: null, confidence: null }));
    const { pages: raw } = createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: 900 });
    // The library splits by time; the bible also caps each page at four words.
    return raw.flatMap((p) => {
      const out: (typeof p.tokens)[] = [];
      for (let i = 0; i < p.tokens.length; i += maxWords) out.push(p.tokens.slice(i, i + maxWords));
      return out;
    });
  }, [words, fps, maxWords]);
  const ms = (frame / fps) * 1000;
  const page = [...pages].reverse().find((p) => p[0]!.fromMs <= ms);
  if (!page) return null;
  return (
    <AbsoluteFill>
      <div style={{ ...TYPE.caption, position: "absolute", left: LAYOUT.safe.x, width: 888, top: LAYOUT.captionY - 30, textAlign: "center", whiteSpace: "pre" }}>
        {page.map((t, i) => (
          <span key={i} style={{ color: ms >= t.fromMs ? KIT.text : KIT.unspoken }}>
            {t.text}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};
