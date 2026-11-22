/*
 * The voice is the clock: every beat starts on the frame of its cue word, the endscreen starts on
 * the spoken "Join" of the closing "Join the waitlist, link in bio." and the video ends
 * END_TAIL_SECONDS after the last word. Nothing here has a hard-coded duration.
 * Used by the compositions and by scripts/video-check.ts, so both see the same frames.
 */
import type { BeatSpec, VideoSpec, Word } from "./types";
import { findCue, normalizeWord } from "./words";

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
/** Every script ends with this sentence; the endscreen starts on its first word. */
export const CTA = "Join the waitlist, link in bio.";
/** The video ends this long after the last word. */
export const END_TAIL_SECONDS = 0.6;
/** Before the spoken CTA rule (TEST-01): silence after the last word, then a 2 s endscreen. */
export const LEGACY_TAIL_SECONDS = 0.15;
export const LEGACY_ENDSCREEN_SECONDS = 2.0;

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
  /** Where the beats and the captions end: the endscreen's first frame. */
  voiceEndFrame: number;
  endscreenFrom: number;
  endscreenFrames: number;
  /** Index of the spoken "Join" of the CTA in words.json, or -1 for a video without it. */
  ctaIndex: number;
  /** Endscreen-local frame "link" (of "link in bio") is spoken on, when the CTA is spoken. */
  linkFrame?: number;
  durationInFrames: number;
  /** The cover still (hook) frame. */
  coverFrame: number;
}

export const secondsToFrame = (s: number, fps = FPS) => Math.round(s * fps);

/** Index of the first word of the closing CTA, if the narration ends with it; else -1. */
export function ctaIndex(words: { word: string }[]): number {
  const cta = CTA.split(/\s+/).map(normalizeWord);
  const tail = words.slice(-cta.length).map((w) => normalizeWord(w.word));
  return tail.length === cta.length && tail.every((w, i) => w === cta[i]) ? words.length - cta.length : -1;
}

export function buildTimeline(spec: VideoSpec, words: Word[], fps = FPS): Timeline {
  if (words.length === 0) throw new Error(`${spec.id}: words.json is empty`);
  if (spec.beats.length === 0) throw new Error(`${spec.id}: the spec has no beats`);
  const last = words[words.length - 1]!;
  const cta = ctaIndex(words);
  let endscreenFrom: number;
  let durationInFrames: number;
  let linkFrame: number | undefined;
  if (cta >= 0) {
    endscreenFrom = secondsToFrame(words[cta]!.start, fps);
    durationInFrames = Math.ceil((last.end + END_TAIL_SECONDS) * fps);
    linkFrame = secondsToFrame(words[cta + 4]!.start, fps) - endscreenFrom;
  } else {
    endscreenFrom = Math.ceil((last.end + LEGACY_TAIL_SECONDS) * fps);
    durationInFrames = endscreenFrom + Math.round(LEGACY_ENDSCREEN_SECONDS * fps);
  }

  const cues = spec.beats.map((b, i) => {
    const cueIndex = findCue(words, b.cue);
    if (cueIndex < 0) throw new Error(`${spec.id}: beat ${i + 1} cue "${b.cue}" is not in the narration`);
    if (cta >= 0 && cueIndex >= cta) throw new Error(`${spec.id}: beat ${i + 1} cue "${b.cue}" is inside the closing CTA (the endscreen starts on "Join")`);
    return { cueIndex, cueFrame: secondsToFrame(words[cueIndex]!.start, fps) };
  });
  for (let i = 1; i < cues.length; i++) {
    if (cues[i]!.cueFrame <= cues[i - 1]!.cueFrame) throw new Error(`${spec.id}: beat ${i + 1} ("${spec.beats[i]!.cue}") starts before or with beat ${i}`);
  }
  const beats: TimedBeat[] = spec.beats.map((b, i) => {
    const from = i === 0 ? 0 : cues[i]!.cueFrame;
    const until = i + 1 < cues.length ? cues[i + 1]!.cueFrame : endscreenFrom;
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
  return {
    beats,
    voiceEndFrame: endscreenFrom,
    endscreenFrom,
    endscreenFrames: durationInFrames - endscreenFrom,
    ctaIndex: cta,
    ...(linkFrame !== undefined ? { linkFrame } : {}),
    durationInFrames,
    coverFrame,
  };
}
