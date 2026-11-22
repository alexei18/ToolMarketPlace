/*
 * The timeline of a motion-kit video. The voice is the clock for act 1, the music for act 2.
 * Act 1 plays the cleaned voice as recorded. The twist word sets the drop's frame. Act 2 has no voice
 * and lasts a whole number of music beats. The closing CTA, which follows act 1 directly in the
 * recording, is placed after those beats, and the music carries on to the end.
 * Pure: used by the composition and by video-check, so both see the same frames.
 */
import { shiftCues, type Cue, type CueType } from "../kit/cues";
import { kitCues, stageCues, type KitBeat } from "../kit/scenes";
import type { Word } from "./types";
import { findCue, normalizeWord } from "./words";

export interface MusicAnalysis {
  file: string;
  seconds: number;
  bpm: number;
  /** Beat times in seconds. */
  beats: number[];
  drop: { at: number; jumpDb: number; source: "detected" | "override" | "weak" };
  lufs: number;
  truePeak: number;
}

export type KitAt = { cue: string; offsetFrames?: number } | { musicBeat: number } | { frame: number };

export type KitBeatSpec = KitBeat & {
  at: KitAt;
  /** A sound on the cut, when the component has none of its own. */
  sfx?: CueType;
  /** KaraokeCaption with the words spoken during this beat (centered scenes). */
  caption?: boolean;
  stage?: { drift?: boolean };
};

export interface KitSpec {
  /** The word the music drops on. */
  twist: { cue: string };
  /** The track, inside public/, with its .analysis.json next to it. */
  music: string;
  /** Act 2's length in beats of the music: the CTA starts on this beat after the drop. */
  act2Beats: number;
  /** The closing sentence, spoken. */
  cta: string;
  beats: KitBeatSpec[];
  /** Reveals on screen that aren't cuts: each needs a sound (video-check). */
  reveals?: { at: KitAt }[];
}

export interface TimedKitBeat {
  index: number;
  spec: KitBeatSpec;
  from: number;
  durationInFrames: number;
  /** The component's props with cues, words and music beats resolved to frames from its start. */
  beat: KitBeat;
  /** Words spoken during this beat, frames from its start, when it shows captions. */
  captionWords?: { word: string; from: number; to: number }[];
}

export interface KitTimeline {
  fps: number;
  beats: TimedKitBeat[];
  /** The words on the video's timeline (the CTA moved after act 2). */
  words: Word[];
  ctaIndex: number;
  twistIndex: number;
  twistFrame: number;
  /** The frame the music's drop plays on, after rounding its start to a whole frame. */
  dropFrame: number;
  ctaFrame: number;
  /** Frames of the music's beats from the drop on. */
  beatFrames: number[];
  voice: { act1Frames: number; cta: { from: number; trimBefore: number; frames: number } };
  music: { from: number; trimBefore: number; frames: number; gainDb: number; duck: [number, number][] };
  cues: Cue[];
  reveals: number[];
  durationInFrames: number;
}

export const TAIL_SECONDS = 0.5;
/** The riser ends here before the drop, leaving near silence. */
export const SILENCE_FRAMES = 12;
export const RISER_FRAMES = 54;
/** Music under the voice. */
export const DUCK_DB = -11;
export const DUCK_RAMP = 6;
/** The music's loudness before ducking, relative to the voice. */
export const MUSIC_LUFS = -15;

const sec = (s: number, fps: number) => Math.round(s * fps);

/** Index of the first word of the closing sentence; -1 if the words don't end with it. */
export function kitCtaIndex(words: { word: string }[], cta: string): number {
  const want = cta.split(/\s+/).map(normalizeWord).filter(Boolean);
  const tail = words.slice(-want.length).map((w) => normalizeWord(w.word));
  return tail.length === want.length && tail.every((w, i) => w === want[i]) ? words.length - want.length : -1;
}

/** Windows where the voice speaks over the music; words close together share one. */
export function duckWindows(words: Word[], fps: number, fromFrame: number): [number, number][] {
  const out: [number, number][] = [];
  for (const w of words) {
    const a = sec(w.start, fps);
    const b = sec(w.end, fps);
    if (b < fromFrame) continue;
    const last = out.at(-1);
    if (last && a - last[1] < 12) last[1] = b;
    else out.push([a, b]);
  }
  return out;
}

/** The music's gain in dB on a frame: ducked under the voice, with short ramps. */
export function duckDb(frame: number, windows: [number, number][]): number {
  let amount = 0;
  for (const [a, b] of windows) {
    const v = frame < a - DUCK_RAMP || frame > b + DUCK_RAMP ? 0 : frame < a ? (frame - (a - DUCK_RAMP)) / DUCK_RAMP : frame > b ? (b + DUCK_RAMP - frame) / DUCK_RAMP : 1;
    amount = Math.max(amount, v);
  }
  return DUCK_DB * amount;
}

export function buildKitTimeline(id: string, kit: KitSpec, rawWords: Word[], music: MusicAnalysis, fps: number): KitTimeline {
  const ctaIndex = kitCtaIndex(rawWords, kit.cta);
  if (ctaIndex < 0) throw new Error(`${id}: the narration doesn't end with "${kit.cta}"`);
  const twistIndex = findCue(rawWords, kit.twist.cue);
  if (twistIndex < 0 || twistIndex >= ctaIndex) throw new Error(`${id}: twist cue "${kit.twist.cue}" isn't in act 1`);

  const twistFrame = sec(rawWords[twistIndex]!.start, fps);
  const trimBefore = sec(music.drop.at, fps);
  const dropFrame = twistFrame;
  const grid = music.beats.filter((b) => b >= music.drop.at - 0.02);
  const beatFrames = grid.map((b) => dropFrame + sec(b - music.drop.at, fps));
  const beatFrame = (n: number) => {
    const f = beatFrames[n];
    if (f === undefined) throw new Error(`${id}: the track has only ${beatFrames.length} beats after its drop, beat ${n} was asked for`);
    return f;
  };

  const ctaFrame = beatFrame(kit.act2Beats);
  const ctaStart = rawWords[ctaIndex]!.start;
  const lastAct1 = rawWords[ctaIndex - 1]!;
  if (ctaFrame <= sec(lastAct1.end, fps)) throw new Error(`${id}: act 2 is too short, the CTA would start before act 1's last word ends`);
  const shift = ctaFrame / fps - ctaStart;
  const words = rawWords.map((w, i) => (i >= ctaIndex ? { ...w, start: w.start + shift, end: w.end + shift } : w));
  const last = words[words.length - 1]!;
  const durationInFrames = Math.ceil((last.end + TAIL_SECONDS) * fps);

  // The voice is cut in the middle of the silence before the CTA.
  const splitFrame = Math.floor(((lastAct1.end + ctaStart) / 2) * fps);
  const voice = { act1Frames: splitFrame, cta: { from: ctaFrame - (sec(ctaStart, fps) - splitFrame), trimBefore: splitFrame, frames: durationInFrames - (ctaFrame - (sec(ctaStart, fps) - splitFrame)) } };

  const at = (a: KitAt): number => {
    if ("frame" in a) return a.frame;
    if ("musicBeat" in a) return beatFrame(a.musicBeat);
    const i = findCue(words, a.cue);
    if (i < 0) throw new Error(`${id}: cue "${a.cue}" is not in the narration`);
    return sec(words[i]!.start, fps) + (a.offsetFrames ?? 0);
  };

  const starts = kit.beats.map((b, i) => (i === 0 ? 0 : at(b.at)));
  for (let i = 1; i < starts.length; i++) if (starts[i]! <= starts[i - 1]!) throw new Error(`${id}: beat ${i + 1} (${kit.beats[i]!.scene}) starts before or with beat ${i}`);

  /** Cues, word frames and music beats inside a component's props, as frames from its start. */
  const resolve = (value: unknown, from: number): unknown => {
    if (Array.isArray(value)) return value.map((v) => resolve(v, from));
    if (value && typeof value === "object") {
      const o = value as Record<string, unknown>;
      if (typeof o.$cue === "string") return at({ cue: o.$cue, offsetFrames: Number(o.offset ?? 0) }) - from;
      if (typeof o.$musicBeat === "number") return beatFrame(o.$musicBeat) - from;
      if (typeof o.$words === "string") {
        // Consecutive words starting at the first one's cue (`word#2` for a later occurrence).
        const [head, ...rest] = o.$words.split(/\s+/);
        const i = findCue(words, head!);
        if (i < 0) throw new Error(`${id}: "$words" starts with "${head}", which is not in the narration`);
        return [head, ...rest].map((_, k) => {
          const w = words[i + k];
          if (!w) throw new Error(`${id}: "$words" runs past the narration`);
          return sec(w.start, fps) - from;
        });
      }
      return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, resolve(v, from)]));
    }
    return value;
  };

  const beats: TimedKitBeat[] = kit.beats.map((spec, index) => {
    const from = starts[index]!;
    const until = starts[index + 1] ?? durationInFrames;
    const beat = { scene: spec.scene, props: resolve(spec.props, from) } as KitBeat;
    const timed: TimedKitBeat = { index, spec, from, durationInFrames: until - from, beat };
    if (spec.caption) {
      timed.captionWords = words
        .filter((w) => sec(w.start, fps) >= from && sec(w.start, fps) < until)
        .map((w) => ({ word: w.word.replace(/[.,;:]+$/, ""), from: sec(w.start, fps) - from, to: sec(w.end, fps) - from }));
    }
    return timed;
  });

  const silenceFrom = dropFrame - SILENCE_FRAMES;
  const cues: Cue[] = [
    // Room tone only under act 1, and gone for the silence before the drop.
    ...stageCues(silenceFrom),
    { frame: Math.max(0, silenceFrom - RISER_FRAMES), type: "riser" },
    ...beats.flatMap((b) => [...shiftCues(kitCues(b.beat, b.durationInFrames), b.from), ...(b.spec.sfx ? [{ frame: b.from, type: b.spec.sfx }] : [])]),
  ];
  if (!cues.some((c) => c.frame === dropFrame && (c.type === "impactHeavy" || c.type === "impact"))) cues.push({ frame: dropFrame, type: "impactHeavy" });

  return {
    fps,
    beats,
    words,
    ctaIndex,
    twistIndex,
    twistFrame,
    dropFrame,
    ctaFrame,
    beatFrames,
    voice,
    music: { from: dropFrame, trimBefore, frames: durationInFrames - dropFrame, gainDb: MUSIC_LUFS - music.lufs, duck: duckWindows(words, fps, dropFrame) },
    cues: cues.sort((a, b) => a.frame - b.frame),
    reveals: (kit.reveals ?? []).map((r) => at(r.at)),
    durationInFrames,
  };
}
