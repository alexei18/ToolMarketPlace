/*
 * npm run video:prepare runs this first. vo/<ID>.wav → public/vo/<ID>.wav:
 * 1. trim the silence before the first and after the last word;
 * 2. shorten every internal pause longer than 0.25 s to 0.18 s;
 * 3. bring the loudness to -14 LUFS with a gain and a -1.5 dBTP limiter, measured with loudnorm.
 * The recorded tempo is kept: a slow or rushed read is re-recorded, not stretched (video-check warns
 * outside 2.8–3.5 words/s). Only silent stretches are removed, keeping 90 ms of silence next to each word, so no word is cut.
 * The original file is never changed.
 *
 * [beat 0.3–1.0] in a script is a pause on purpose. setBeats runs once the words are aligned, because it
 * has to know which silence sits between which words: each marked pause becomes exactly that long
 * (cut, or padded with silence if the reading ran on), and step 2 still applies to every other pause.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Word } from "../src/lib/types";
import { scriptBeats, scriptWords } from "../src/lib/words";
import { decodeMono, durationOf, ensureDir, FFMPEG, fail, idArg, loadSpec, paths, run, writeJson, writeWav } from "./lib/common";
import { silenceMap } from "./lib/silence";

const RATE = 48000;
const MAX_PAUSE = 0.25;
const KEEP_PAUSE = 0.18;
const HEAD_KEEP = 0.02;
const TAIL_KEEP = 0.06;
const TARGET_LUFS = -14;
const TRUE_PEAK = -1.5;
/** The limiter works on sample peaks; true (inter-sample) peaks land up to ~1 dB higher, so it aims lower. */
const LIMITER_CEILING = TRUE_PEAK - 1;

/** Integrated loudness and true peak of a file (ffmpeg loudnorm's measurement). */
export async function measureLoudness(file: string): Promise<{ i: number; tp: number }> {
  const { stderr } = await run(FFMPEG, ["-hide_banner", "-i", file, "-af", "loudnorm=print_format=json", "-f", "null", "-"]);
  const m = JSON.parse(stderr.slice(stderr.lastIndexOf("{"), stderr.lastIndexOf("}") + 1)) as Record<string, string>;
  return { i: Number(m.input_i), tp: Number(m.input_tp) };
}

export async function cleanVoice(id: string) {
  const spec = loadSpec(id);
  const raw = paths.voRaw(id);
  const samples = await decodeMono(raw, RATE).catch(() => fail(`No voice at ${raw}. Drop the recording there, or run: npm run video:voice ${id}`));
  const map = silenceMap(samples, RATE);
  if (map.first < 0) fail(`${raw} contains no speech`);

  // Keep [start, end] minus the middle of every long pause.
  const start = Math.max(0, map.first * map.hop - HEAD_KEEP);
  const end = Math.min(samples.length / RATE, (map.last + 1) * map.hop + TAIL_KEEP);
  const cuts = map.pauses.filter((p) => p.to - p.from > MAX_PAUSE).map((p) => ({ from: p.from + KEEP_PAUSE / 2, to: p.to - KEEP_PAUSE / 2, was: p.to - p.from }));
  const keep: [number, number][] = [];
  let t = start;
  for (const c of cuts) {
    keep.push([t, c.from]);
    t = c.to;
  }
  keep.push([t, end]);

  // Join the kept pieces with a 5 ms crossfade so the joins don't click.
  const xf = Math.round(0.005 * RATE);
  const pieces = keep.map(([a, b]) => samples.subarray(Math.round(a * RATE), Math.round(b * RATE)));
  const out = new Float32Array(pieces.reduce((n, p) => n + p.length, 0) - xf * (pieces.length - 1));
  let pos = 0;
  pieces.forEach((p, i) => {
    for (let j = 0; j < p.length; j++) {
      const o = pos + j;
      out[o] = i > 0 && j < xf ? out[o]! * (1 - j / xf) + p[j]! * (j / xf) : p[j]!;
    }
    pos += p.length - xf;
  });

  const wordCount = scriptWords(spec.script).length;
  const rate = wordCount / (out.length / RATE);

  const tmp = mkdtempSync(path.join(os.tmpdir(), "vo-clean-"));
  try {
    const trimmed = path.join(tmp, "trimmed.wav");
    writeWav(trimmed, out, RATE);
    const final = paths.voClean(id);
    ensureDir(path.dirname(final));
    // Gain to the target, limited to the true-peak ceiling; again (up to six passes) while the limiter costs loudness.
    let gain = TARGET_LUFS - (await measureLoudness(trimmed)).i;
    let measured = { i: 0, tp: 0 };
    for (let pass = 0; pass < 6; pass++) {
      await run(FFMPEG, [
        "-hide_banner", "-y", "-i", trimmed,
        "-af", `volume=${gain.toFixed(2)}dB,alimiter=limit=${Math.pow(10, LIMITER_CEILING / 20).toFixed(4)}:level=false:attack=1:release=50`,
        "-ar", String(RATE), "-ac", "1", "-c:a", "pcm_s16le", final,
      ]);
      measured = await measureLoudness(final);
      if (Math.abs(measured.i - TARGET_LUFS) <= 0.3) break;
      gain += TARGET_LUFS - measured.i;
    }
    const finalSeconds = await durationOf(final);
    const report = {
      source: path.relative(process.cwd(), raw),
      output: path.relative(process.cwd(), final),
      originalSeconds: +(samples.length / RATE).toFixed(3),
      trimmedHead: +start.toFixed(3),
      trimmedTail: +(samples.length / RATE - end).toFixed(3),
      silenceThresholdDb: +map.threshold.toFixed(1),
      pausesShortened: cuts.map((c) => ({ at: +(c.from - KEEP_PAUSE / 2).toFixed(2), was: +c.was.toFixed(3), now: KEEP_PAUSE })),
      wordCount,
      wordsPerSecondBefore: +rate.toFixed(2),
      finalSeconds: +finalSeconds.toFixed(3),
      wordsPerSecondAfter: +(wordCount / finalSeconds).toFixed(2),
      loudnessLufs: measured.i,
      truePeakDb: measured.tp,
    };
    writeJson(paths.cleanReport(id), report);
    console.log(
      `✔ vo-clean ${id}: ${report.originalSeconds}s → ${report.finalSeconds}s, ${cuts.length} pause(s) shortened, ` +
        `${report.wordsPerSecondBefore} → ${report.wordsPerSecondAfter} words/s, ${report.loudnessLufs} LUFS, ${report.truePeakDb} dBTP`,
    );
    return report;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** A cut and what replaces it: `seconds` of silence between `from` and `to`. */
export interface PauseEdit {
  from: number;
  to: number;
  seconds: number;
}

/** Replaces each stretch with exact silence, a 5 ms fade on each side so the joins don't click. Pure. */
export function setPauses(samples: Float32Array, rate: number, edits: PauseEdit[]): Float32Array {
  const fade = Math.round(0.005 * rate);
  const sorted = [...edits].sort((a, b) => a.from - b.from);
  const parts: Float32Array[] = [];
  let t = 0;
  for (const e of sorted) {
    const a = Math.round(e.from * rate);
    const b = Math.round(e.to * rate);
    parts.push(samples.slice(t, a), new Float32Array(Math.round(e.seconds * rate)));
    t = b;
  }
  parts.push(samples.slice(t));
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  parts.forEach((p, i) => {
    if (i % 2 === 0 && parts.length > 1) {
      const c = p.slice();
      if (i > 0) for (let j = 0; j < Math.min(fade, c.length); j++) c[j]! *= j / fade;
      if (i < parts.length - 1) for (let j = 0; j < Math.min(fade, c.length); j++) c[c.length - 1 - j]! *= j / fade;
      out.set(c, pos);
    } else {
      out.set(p, pos);
    }
    pos += p.length;
  });
  return out;
}

/** Word timings after the edits: each word moves by what the edits before it added or removed. Pure. */
export function shiftWords(words: Word[], afterWord: number[], edits: PauseEdit[]): Word[] {
  let shift = 0;
  return words.map((w, i) => {
    const edit = edits[afterWord.indexOf(i - 1)];
    if (edit) {
      // This word starts after the edit, whatever the alignment thought about where the gap was.
      shift += edit.seconds - (edit.to - edit.from);
      const end = Math.max(w.end, edit.to + 0.02);
      return { ...w, start: +(Math.max(w.start, edit.to) + shift).toFixed(3), end: +(end + shift).toFixed(3) };
    }
    const next = edits[afterWord.indexOf(i)];
    // The word before the edit ends where it starts.
    const end = next ? Math.min(w.end, next.from) : w.end;
    return { ...w, start: +(w.start + shift).toFixed(3), end: +(Math.max(end, w.start + 0.02) + shift).toFixed(3) };
  });
}

/** Sets every [beat] pause of the cleaned voice to its exact length. Needs the words of that voice. */
export async function setBeats(id: string): Promise<{ after: string; seconds: number }[]> {
  const spec = loadSpec(id);
  const beats = scriptBeats(spec.script);
  if (beats.length === 0) return [];
  const words = JSON.parse(readFileSync(paths.words(id), "utf8")) as Word[];
  const file = paths.voClean(id);
  const samples = await decodeMono(file, RATE);
  const map = silenceMap(samples, RATE);
  const edits: PauseEdit[] = beats.map((b) => {
    if (b.seconds < 0.3 || b.seconds > 1) fail(`${id}: [beat ${b.seconds}] is outside 0.3–1.0 s`);
    const before = words[b.afterWord];
    const after = words[b.afterWord + 1];
    if (!before || !after) fail(`${id}: a [beat] mark needs a word on both sides`);
    // The silence between the two words, as the audio measures it. A reading that ran on has none: cut where they meet.
    const gap = map.pauses.filter((p) => p.from < after.start + 0.06 && p.to > before.end - 0.06).sort((x, y) => y.to - y.from - (x.to - x.from))[0];
    const mid = (before.end + after.start) / 2;
    return { from: gap?.from ?? mid, to: gap?.to ?? mid, seconds: b.seconds };
  });
  writeWav(file, setPauses(samples, RATE, edits), RATE);
  // The words move with the edits. Whisper isn't asked again: next to a long pause it misplaces words
  // by half a second, and here every shift is known exactly.
  writeJson(paths.words(id), shiftWords(words, beats.map((b) => b.afterWord), edits));
  const done = beats.map((b) => ({ after: words[b.afterWord]!.word, seconds: b.seconds }));
  const report = JSON.parse(readFileSync(paths.cleanReport(id), "utf8")) as Record<string, unknown>;
  writeJson(paths.cleanReport(id), { ...report, beatsKept: done.map((d, i) => ({ ...d, was: +(edits[i]!.to - edits[i]!.from).toFixed(3) })), finalSeconds: +(await durationOf(file)).toFixed(3) });
  console.log(`✔ vo-clean ${id}: ${done.length} [beat] pause(s) set to their exact length`);
  return done;
}

if (process.argv[1]?.endsWith("vo-clean.ts")) {
  await cleanVoice(idArg());
}
