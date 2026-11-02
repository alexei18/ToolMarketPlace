/*
 * Burned-in captions from words.json: pages of 2–4 words, broken after punctuation and at beat
 * cuts, each shown from its first word until the next page starts.
 */
import type { Timeline } from "./timeline";
import type { Word } from "./types";
import { displayWord, normalizeWord } from "./words";

export interface CaptionWord {
  text: string;
  /** Frames, absolute. */
  start: number;
  end: number;
  keyword: boolean;
}

export interface CaptionPage {
  words: CaptionWord[];
  /** Index of the beat the page belongs to. */
  beat: number;
  from: number;
  /** Exclusive. */
  until: number;
}

const MAX = 4;
const MIN = 2;

/** Caption type: one line, 58 px, smaller only when a page would not fit the 720 px band. */
export const CAPTION_FONT = { size: 58, min: 44, padX: 28 };
/** Inter Tight 600 averages under 0.56 em per character (spaces included): an upper estimate. */
const EM_PER_CHAR = 0.56;

/** Font size that keeps a page on one line inside the band. */
export function captionFontSize(text: string, bandWidth: number): number {
  return Math.min(CAPTION_FONT.size, Math.floor((bandWidth - CAPTION_FONT.padX * 2) / (text.length * EM_PER_CHAR)));
}

export function captionPages(words: Word[], timeline: Timeline, keywords: string[] = [], fps = 30): CaptionPage[] {
  const keys = new Set(keywords.map(normalizeWord));
  const beatStarts = new Set(timeline.beats.map((b) => b.cueIndex));
  const beatOf = (i: number) => timeline.beats.reduce((acc, b) => (b.cueIndex <= i ? b.index : acc), 0);

  // Phrases: split at beat cuts (always) and after punctuation. A one-word phrase joins its
  // neighbour inside the same beat, never across a cut.
  const phrases: number[][] = [];
  let cur: number[] = [];
  words.forEach((w, i) => {
    if (cur.length && beatStarts.has(i)) {
      phrases.push(cur);
      cur = [];
    }
    cur.push(i);
    if (/[.,!?;:]$/.test(w.word)) {
      phrases.push(cur);
      cur = [];
    }
  });
  if (cur.length) phrases.push(cur);
  for (let p = 0; p < phrases.length; p++) {
    if (phrases[p]!.length >= MIN) continue;
    const prev = phrases[p - 1];
    const next = phrases[p + 1];
    const sameBeat = (a: number[] | undefined) => a && beatOf(a[0]!) === beatOf(phrases[p]![0]!);
    if (sameBeat(prev)) {
      prev!.push(...phrases[p]!);
      phrases.splice(p--, 1);
    } else if (sameBeat(next)) {
      next!.unshift(...phrases[p]!);
      phrases.splice(p--, 1);
    }
  }
  // Pages: each phrase in as few pages of at most 4 words as possible, balanced (5 → 3 + 2, 7 → 4 + 3).
  const groups: number[][] = [];
  for (const phrase of phrases) {
    const count = Math.ceil(phrase.length / MAX);
    const size = Math.ceil(phrase.length / count);
    for (let i = 0; i < phrase.length; i += size) groups.push(phrase.slice(i, i + size));
  }

  const frame = (s: number) => Math.round(s * fps);
  return groups.map((idx, g) => {
    const first = idx[0]!;
    const next = groups[g + 1]?.[0];
    const until = next !== undefined ? frame(words[next]!.start) : timeline.voiceEndFrame;
    return {
      beat: beatOf(first),
      from: frame(words[first]!.start),
      until: Math.min(until, timeline.voiceEndFrame),
      words: idx.map((i) => ({ text: displayWord(words[i]!.word), start: frame(words[i]!.start), end: frame(words[i]!.end), keyword: keys.has(normalizeWord(words[i]!.word)) })),
    };
  });
}
