/*
 * The voice is the clock: every beat starts on the frame of its cue word, and the video ends
 * TAIL_SECONDS after the last word plus the endscreen. Nothing here has a hard-coded duration.
 * Used by the compositions and by scripts/vo-check.ts, so both see the same frames.
 */
import type { BeatSpec, VideoSpec, Word } from "./types";
import { findCue } from "./words";

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
/** Silence kept after the last word before the endscreen. */
export const TAIL_SECONDS = 0.15;
export const ENDSCREEN_SECONDS = 2.0;

export interface TimedBeat extends BeatSpec {
  index: number;
  /** Index of the cue word in words.json. */
  cueIndex: number;
  /** Frame the cue word starts on. */
  cueFrame: number;
  /** Sequence start: the cue frame, except the first beat, which also covers the frames before the first word. */
  from: number;
  durationInFrames: number;
}

export interface Timeline {
  beats: TimedBeat[];
  /** First frame after the voice (last word end + TAIL_SECONDS). */
  voiceEndFrame: number;
  endscreenFrom: number;
  endscreenFrames: number;
  durationInFrames: number;
  /** The cover still (hook) frame. */
  coverFrame: number;
}

export const secondsToFrame = (s: number, fps = FPS) => Math.round(s * fps);

export function buildTimeline(spec: VideoSpec, words: Word[], fps = FPS): Timeline {
  if (words.length === 0) throw new Error(`${spec.id}: words.json is empty`);
  if (spec.beats.length === 0) throw new Error(`${spec.id}: the spec has no beats`);
  const last = words[words.length - 1]!;
  const voiceEndFrame = Math.ceil((last.end + TAIL_SECONDS) * fps);
  const endscreenFrames = Math.round(ENDSCREEN_SECONDS * fps);

  const cues = spec.beats.map((b, i) => {
    const cueIndex = findCue(words, b.cue);
    if (cueIndex < 0) throw new Error(`${spec.id}: beat ${i + 1} cue "${b.cue}" is not in the narration`);
    return { cueIndex, cueFrame: secondsToFrame(words[cueIndex]!.start, fps) };
  });
  for (let i = 1; i < cues.length; i++) {
    if (cues[i]!.cueFrame <= cues[i - 1]!.cueFrame) throw new Error(`${spec.id}: beat ${i + 1} ("${spec.beats[i]!.cue}") starts before or with beat ${i}`);
  }
  const beats: TimedBeat[] = spec.beats.map((b, i) => {
    const from = i === 0 ? 0 : cues[i]!.cueFrame;
    const until = i + 1 < cues.length ? cues[i + 1]!.cueFrame : voiceEndFrame;
    return { ...b, index: i, cueIndex: cues[i]!.cueIndex, cueFrame: cues[i]!.cueFrame, from, durationInFrames: Math.max(1, until - from) };
  });

  let coverFrame = beats[0]!.cueFrame;
  if (spec.cover) {
    const i = findCue(words, spec.cover.cue);
    if (i < 0) throw new Error(`${spec.id}: cover cue "${spec.cover.cue}" is not in the narration`);
    // Inside the beat the cover word belongs to, so the cover shows that beat.
    const beat = [...beats].reverse().find((b) => b.cueIndex <= i)!;
    coverFrame = Math.min(secondsToFrame(words[i]!.end, fps) + (spec.cover.offsetFrames ?? 0), beat.from + beat.durationInFrames - 1);
  }
  return { beats, voiceEndFrame, endscreenFrom: voiceEndFrame, endscreenFrames, durationInFrames: voiceEndFrame + endscreenFrames, coverFrame };
}
