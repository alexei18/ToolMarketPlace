/*
 * The kit's timing, as pure functions: components draw from these and their sound cues come from
 * the same numbers, so a key click can't land off its letter. Node scripts read them too.
 */
import facts from "../data/facts.json";

export const COUNTS = facts.counts;
export const SERIES = facts.series;
export type CountFact = keyof typeof facts.counts;
export type SeriesFact = keyof typeof facts.series;

/** Frames per typed letter and per erased letter. */
export const TYPE_FRAMES = 2;
export const ERASE_FRAMES = 1;

export interface TypeStep {
  /** Frame this step starts. */
  at: number;
  /** The text the field ends up with: erases back to what the two have in common, then types the rest. */
  text: string;
}

export interface TypeEvent {
  frame: number;
  text: string;
  kind: "type" | "erase";
}

/** Every letter typed or erased, in order. */
export function typeEvents(steps: TypeStep[]): TypeEvent[] {
  const out: TypeEvent[] = [];
  let current = "";
  for (const s of steps) {
    let common = 0;
    while (common < current.length && common < s.text.length && current[common] === s.text[common]) common++;
    let f = s.at;
    for (let n = current.length - 1; n >= common; n--) {
      out.push({ frame: f, text: current.slice(0, n), kind: "erase" });
      f += ERASE_FRAMES;
    }
    for (let n = common + 1; n <= s.text.length; n++) {
      out.push({ frame: f, text: s.text.slice(0, n), kind: "type" });
      f += TYPE_FRAMES;
    }
    current = s.text;
  }
  return out;
}

export function textAt(steps: TypeStep[], frame: number): string {
  let text = "";
  for (const e of typeEvents(steps)) {
    if (e.frame > frame) break;
    text = e.text;
  }
  return text;
}

/** Ticks that speed up until the counter stops: 9 frames apart at first, 2 at the end. */
export function counterTicks(settleAt: number): number[] {
  const out: number[] = [];
  let f = settleAt;
  let gap = 2;
  while (f > 0) {
    out.unshift(Math.round(f));
    f -= gap;
    gap = Math.min(9, gap * 1.18);
  }
  return out;
}
