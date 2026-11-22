/*
 * Every meaningful change on screen, frame by frame: a cut, a move inside the phone screen, a
 * highlight, a cursor action, a state switch, a light sweep, a kinetic word landing. video-check
 * warns when a shot holds longer than 1.5 s without one. Read from the spec props the scenes
 * use, on the same word timings.
 */
import type { Timeline, TimedBeat } from "./timeline";
import type { Word } from "./types";
import { findCue, normalizeWord } from "./words";

export interface ScreenEvent {
  frame: number;
  beat: number;
  what: string;
}

/** Longest a shot may hold without a meaningful change (video-check warning). */
export const MAX_HOLD_SECONDS = 1.5;

/** Spoken start frames of on-screen words, matched in order inside the beat (as KineticText does). */
function shownWordFrames(words: Word[], range: [number, number], shown: string[], fps: number): { word: string; frame: number }[] {
  let cursor = range[0];
  const out: { word: string; frame: number }[] = [];
  for (const w of shown) {
    const n = normalizeWord(w);
    for (let i = cursor; i < range[1]; i++) {
      if (normalizeWord(words[i]!.word) === n) {
        out.push({ word: w, frame: Math.round(words[i]!.start * fps) });
        cursor = i + 1;
        break;
      }
    }
  }
  return out;
}

export function screenEvents(tl: Timeline, words: Word[], fps: number): ScreenEvent[] {
  const events: ScreenEvent[] = [];
  const at = (cue: string | undefined, fallback: number) => {
    const i = cue ? findCue(words, cue) : -1;
    return i >= 0 ? Math.round(words[i]!.start * fps) : fallback;
  };
  tl.beats.forEach((b: TimedBeat, i) => {
    const next = tl.beats[i + 1];
    const range: [number, number] = [b.cueIndex, next ? next.cueIndex : tl.ctaIndex >= 0 ? tl.ctaIndex : words.length];
    const add = (frame: number, what: string) => events.push({ frame, beat: i + 1, what });
    const p = (b.props ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    add(b.cueFrame, i === 0 ? `${b.scene} starts` : `cut to ${b.scene}`);
    switch (b.scene) {
      case "KineticText": {
        const lines = (p.lines as string[]) ?? [];
        const shown = lines.flatMap((l) => l.split(/\s+/).filter(Boolean));
        const frames = shownWordFrames(words, range, shown, fps);
        const keys = new Set(((p.highlight as string[] | undefined) ?? []).map(normalizeWord));
        for (const w of frames) if (p.mode !== "highlight" || keys.has(normalizeWord(w.word))) add(w.frame, `"${w.word}" lands`);
        break;
      }
      case "StatOrQuote":
        for (const w of shownWordFrames(words, range, String(p.text ?? "").split(/\s+/), fps)) add(w.frame, `"${w.word}" lights up`);
        break;
      case "PhoneFrame":
        for (const s of ((p.scroll as { cue?: string }[]) ?? []).slice(1)) add(at(s.cue, b.cueFrame), "scroll inside the screen");
        if (p.zoom) add(at(p.zoom.cue, b.cueFrame), "zoom inside the screen");
        if (p.highlight) add(at(p.highlight.cue, b.cueFrame), "highlight");
        for (const c of (p.cursor as { cue: string; tap?: boolean }[]) ?? []) add(at(c.cue, b.cueFrame), c.tap === false ? "cursor moves" : "cursor tap");
        if (p.state) add(at(p.state.cue, b.cueFrame) + (p.state.delayFrames ?? 0), `state "${p.state.name}"`);
        break;
      case "CardCrop":
        for (const h of (Array.isArray(p.highlight) ? p.highlight : p.highlight ? [p.highlight] : []) as { cue: string }[]) add(at(h.cue, b.cueFrame), "highlight");
        for (const s of (Array.isArray(p.sweep) ? p.sweep : p.sweep ? [p.sweep] : []) as { cue: string }[]) add(at(s.cue, b.cueFrame), "light sweep");
        for (const c of (p.cursor as { cue: string; tap?: boolean }[]) ?? []) add(at(c.cue, b.cueFrame), c.tap === false ? "cursor moves" : "cursor tap");
        if (p.state) add(at(p.state.cue, b.cueFrame) + (p.state.delayFrames ?? 0), `state "${p.state.name}"`);
        break;
      case "CardReveal":
        add(at(p.flipCue, b.cueFrame), "card flips");
        break;
      case "LightSweep":
        add(at(p.sweepCue, b.cueFrame), "light sweep");
        break;
      case "CheckDraw": {
        const second = p.secondCue ? at(p.secondCue, b.cueFrame + 7) : b.cueFrame + 7;
        add(second, "second check draws");
        if (p.text) add(second + 6, "line appears");
        break;
      }
    }
  });
  events.push({ frame: tl.endscreenFrom, beat: 0, what: "endscreen" });
  if (tl.linkFrame !== undefined) events.push({ frame: tl.endscreenFrom + tl.linkFrame, beat: 0, what: `"link in bio" lands` });
  return events.sort((a, b) => a.frame - b.frame);
}

/** A KineticText beat shows nothing until its first on-screen word is spoken: longer than this is an empty screen. */
export const MAX_EMPTY_SECONDS = 0.3;

/**
 * KineticText beats (slam, typewriter) whose first word is spoken well after the beat starts: the
 * screen is empty until then, so the beat should start on that word instead (cue = that word).
 */
export function emptyStarts(tl: Timeline, words: Word[], fps: number): { beat: number; seconds: number; word: string; frame: number }[] {
  const out: { beat: number; seconds: number; word: string; frame: number }[] = [];
  tl.beats.forEach((b, i) => {
    if (b.scene !== "KineticText") return;
    const p = (b.props ?? {}) as { lines?: string[]; mode?: string };
    if (p.mode === "highlight") return;
    const next = tl.beats[i + 1];
    const range: [number, number] = [b.cueIndex, next ? next.cueIndex : tl.ctaIndex >= 0 ? tl.ctaIndex : words.length];
    const shown = (p.lines ?? []).flatMap((l) => l.split(/\s+/).filter(Boolean));
    const first = shownWordFrames(words, range, shown.slice(0, 1), fps)[0];
    if (!first) {
      out.push({ beat: i + 1, seconds: Infinity, word: shown[0] ?? "", frame: b.from });
      return;
    }
    const seconds = (first.frame - (i === 0 ? 0 : b.from)) / fps;
    if (seconds > MAX_EMPTY_SECONDS) out.push({ beat: i + 1, seconds: +seconds.toFixed(2), word: first.word, frame: first.frame });
  });
  return out;
}

/** Stretches longer than MAX_HOLD_SECONDS with no meaningful change, until the video ends. */
export function longHolds(tl: Timeline, events: ScreenEvent[], fps: number): { from: number; until: number; seconds: number; beat: number; after: string }[] {
  const out: { from: number; until: number; seconds: number; beat: number; after: string }[] = [];
  const max = Math.round(MAX_HOLD_SECONDS * fps);
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    const until = events[i + 1]?.frame ?? tl.durationInFrames;
    if (until - e.frame > max) out.push({ from: e.frame, until, seconds: +((until - e.frame) / fps).toFixed(2), beat: e.beat, after: e.what });
  }
  return out;
}
