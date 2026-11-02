import { createContext, useContext } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { Word } from "./lib/types";
import { findCue, normalizeWord } from "./lib/words";

export interface BeatContextValue {
  words: Word[];
  theme: "light" | "dark";
  keywords: string[];
  /** Absolute frame the beat's Sequence starts on. */
  beatFrom: number;
  /** Absolute frame the beat's cue word starts on (enter animations start here). */
  cueFrame: number;
  /** Words of this beat (from its cue to the next beat's cue), as indices into `words`. */
  wordRange: [number, number];
}

export const BeatContext = createContext<BeatContextValue | null>(null);

export function useBeat(): BeatContextValue & { frame: number; absFrame: number; fps: number } {
  const ctx = useContext(BeatContext);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!ctx) throw new Error("Scenes must be rendered inside a beat");
  return { ...ctx, frame, absFrame: frame + ctx.beatFrom, fps };
}

/** Absolute frame a cue word ("save", "save#2") starts on; falls back to the beat's cue frame. */
export function cueFrameOf(ctx: BeatContextValue, fps: number, cue: string | undefined): number {
  if (!cue) return ctx.cueFrame;
  const i = findCue(ctx.words, cue);
  return i < 0 ? ctx.cueFrame : Math.round(ctx.words[i]!.start * fps);
}

/**
 * For on-screen words, the absolute [start, end] frames each is spoken: matched in order against
 * the beat's spoken words; words that are never said share the timing of the previous one.
 */
export function spokenTimes(ctx: BeatContextValue, fps: number, shown: string[]): [number, number][] {
  let cursor = ctx.wordRange[0];
  let last: [number, number] = [ctx.cueFrame, ctx.cueFrame + 6];
  return shown.map((w) => {
    const n = normalizeWord(w);
    for (let i = cursor; i < ctx.wordRange[1]; i++) {
      if (normalizeWord(ctx.words[i]!.word) === n) {
        cursor = i + 1;
        last = [Math.round(ctx.words[i]!.start * fps), Math.round(ctx.words[i]!.end * fps)];
        return last;
      }
    }
    return last;
  });
}
