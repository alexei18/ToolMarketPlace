/*
 * public/vo/<ID>.wav → vo/<ID>.words.json: word-level timestamps from whisper.cpp (installed by
 * @remotion/install-whisper-cpp into .whisper/, DTW token timing), matched against the script.
 * Any word that doesn't match the script stops the pipeline with a table of the differences.
 * The words are stored as written in the script, with Whisper's timings.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { downloadWhisperModel, installWhisperCpp, transcribe, type WhisperModel } from "@remotion/install-whisper-cpp";
import type { Word } from "../src/lib/types";
import { normalizeWord, scriptWords } from "../src/lib/words";
import { decodeMono, ensureDir, FFMPEG, fail, idArg, loadSpec, paths, ROOT, run, writeJson } from "./lib/common";
import { silenceMap } from "./lib/silence";

const WHISPER_DIR = path.join(ROOT, ".whisper");
const WHISPER_VERSION = "1.5.5";
const MODEL = (process.env.WHISPER_MODEL ?? "small.en") as WhisperModel;

interface Heard {
  text: string;
  start: number;
  end: number;
  /** Whisper's confidence in the word: the mean probability of its text tokens (0–1). */
  p: number;
}

/** Whisper in one-word-per-segment mode: each item is a word with its start and end. */
function heardWords(json: Awaited<ReturnType<typeof transcribe<false>>>): Heard[] {
  return json.transcription
    .map((item) => {
      // whisper.cpp always writes the full JSON (-ojf), tokens included, though the type only lists them with DTW.
      const all = (item as { tokens?: { text: string; p: number }[] }).tokens ?? [];
      const tokens = all.filter((t) => !/^\[_|^<\|/.test(t.text) && t.text.trim() !== "");
      const p = tokens.length ? tokens.reduce((a, t) => a + t.p, 0) / tokens.length : 0;
      return { text: item.text.trim(), start: item.offsets.from / 1000, end: item.offsets.to / 1000, p };
    })
    .filter((w) => normalizeWord(w.text) !== "");
}

/** How each script word was found in what Whisper heard, for the alignment report. */
interface MatchInfo {
  heard: string;
  kind: "exact" | "split" | "merged";
  whisperStart: number;
  whisperEnd: number;
  p: number;
}

const SNAP = 0.12; // s: how far a word boundary may move to meet the audio
const HOP = 0.005;

/**
 * Whisper's segment times drift by up to a couple of tenths of a second, mostly where speech
 * starts after a pause. Where the audio has a clear onset (silence → sound) or offset (sound →
 * silence) near a word boundary, the boundary moves onto it; inside connected speech it stays.
 */
function snapToAudio(words: Word[], samples: Float32Array, rate: number): Word[] {
  const hop = Math.round(HOP * rate);
  const frames = Math.floor(samples.length / hop);
  const db = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) sum += samples[i]! * samples[i]!;
    db[f] = 10 * Math.log10(sum / hop + 1e-12);
  }
  const map = silenceMap(samples, rate, HOP);
  const threshold = map.threshold;
  const firstSound = Math.max(0, map.first) * HOP;
  // A boundary counts only after 30 ms of steady silence on one side and sound on the other.
  const run = 6;
  const onsets: number[] = [];
  const offsets: number[] = [];
  for (let f = run; f < frames - run; f++) {
    const before = db.subarray(f - run, f).every((v) => v <= threshold);
    const after = db.subarray(f, f + run).every((v) => v > threshold);
    if (before && after) onsets.push(f * HOP);
    const was = db.subarray(f - run, f).every((v) => v > threshold);
    const now = db.subarray(f, f + run).every((v) => v <= threshold);
    if (was && now) offsets.push(f * HOP);
  }
  const nearest = (list: number[], t: number) => list.reduce<number | null>((best, x) => (Math.abs(x - t) <= SNAP && (best === null || Math.abs(x - t) < Math.abs(best - t)) ? x : best), null);
  return words.map((w, i) => {
    // The first word always starts on the file's first sound.
    const start = i === 0 ? firstSound : (nearest(onsets, w.start) ?? w.start);
    const end = nearest(offsets, w.end) ?? w.end;
    return { ...w, start, end: Math.max(end, start + 0.04) };
  });
}

/**
 * Matches heard words to script words, allowing a word heard in pieces ("try" + "worthy") or two
 * script words heard as one. Returns null and prints the differences when they don't match.
 */
function match(script: string[], heard: Heard[], info: MatchInfo[] = []): Word[] | null {
  const out: Word[] = [];
  let h = 0;
  const problems: string[] = [];
  for (let s = 0; s < script.length; s++) {
    const want = normalizeWord(script[s]!);
    const got = heard[h];
    if (!got) {
      problems.push(`  script word ${s + 1} "${script[s]}": nothing heard`);
      break;
    }
    if (normalizeWord(got.text) === want) {
      out.push({ word: script[s]!, start: got.start, end: got.end });
      info.push({ heard: got.text, kind: "exact", whisperStart: got.start, whisperEnd: got.end, p: got.p });
      h++;
      continue;
    }
    // One script word heard as several pieces.
    let joined = normalizeWord(got.text);
    let k = h + 1;
    while (k < heard.length && joined.length < want.length && want.startsWith(joined)) joined += normalizeWord(heard[k++]!.text);
    if (joined === want) {
      out.push({ word: script[s]!, start: got.start, end: heard[k - 1]!.end });
      const pieces = heard.slice(h, k);
      info.push({ heard: pieces.map((x) => x.text).join(" + "), kind: "split", whisperStart: got.start, whisperEnd: heard[k - 1]!.end, p: Math.min(...pieces.map((x) => x.p)) });
      h = k;
      continue;
    }
    // Several script words heard as one: share its time evenly.
    let parts = want;
    let j = s + 1;
    while (j < script.length && parts.length < normalizeWord(got.text).length) parts += normalizeWord(script[j++]!);
    if (parts === normalizeWord(got.text)) {
      const n = j - s;
      for (let q = 0; q < n; q++) {
        const w = { word: script[s + q]!, start: got.start + ((got.end - got.start) * q) / n, end: got.start + ((got.end - got.start) * (q + 1)) / n };
        out.push(w);
        info.push({ heard: got.text, kind: "merged", whisperStart: w.start, whisperEnd: w.end, p: got.p });
      }
      s = j - 1;
      h++;
      continue;
    }
    problems.push(`  script word ${s + 1}: expected "${script[s]}", heard "${got.text}" (around ${got.start.toFixed(2)} s)`);
    break;
  }
  if (problems.length === 0 && h < heard.length) problems.push(`  extra words heard after the script ends: "${heard.slice(h).map((w) => w.text).join(" ")}"`);
  if (problems.length) {
    console.error(`\nScript:  ${script.join(" ")}\nHeard:   ${heard.map((w) => w.text).join(" ")}\n${problems.join("\n")}`);
    return null;
  }
  return out;
}

/** Timings in order, every word at least 40 ms, no word running into the next, rounded to ms. */
function tidy(out: Word[]): Word[] {
  for (let i = 0; i < out.length; i++) {
    const w = out[i]!;
    const next = out[i + 1];
    if (i > 0) w.start = Math.max(w.start, out[i - 1]!.start + 0.02);
    if (next) w.end = Math.min(w.end, Math.max(next.start, w.start + 0.04));
    w.end = Math.max(w.end, w.start + 0.04);
    w.start = Math.round(w.start * 1000) / 1000;
    w.end = Math.round(w.end * 1000) / 1000;
  }
  return out;
}

export async function alignVoice(id: string): Promise<Word[]> {
  const spec = loadSpec(id);
  const clean = paths.voClean(id);
  if (!existsSync(clean)) fail(`No cleaned voice at ${clean}: run vo-clean first`);

  await installWhisperCpp({ to: WHISPER_DIR, version: WHISPER_VERSION, printOutput: false });
  await downloadWhisperModel({ model: MODEL, folder: WHISPER_DIR, printOutput: false });

  // whisper.cpp reads 16 kHz mono WAV.
  const tmpDir = path.join(WHISPER_DIR, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const input = path.join(tmpDir, `${id}.16k.wav`);
  await run(FFMPEG, ["-v", "error", "-y", "-i", clean, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", input]);
  const json = await transcribe({
    inputPath: input,
    whisperPath: WHISPER_DIR,
    whisperCppVersion: WHISPER_VERSION,
    model: MODEL,
    modelFolder: WHISPER_DIR,
    tokenLevelTimestamps: false,
    tokensPerItem: 1,
    splitOnWord: true,
    language: "en",
    printOutput: false,
    // The brand name, so Whisper spells it the way the script does.
    additionalArgs: ["--prompt", "Tryworthy."],
  });
  rmSync(input, { force: true });

  const info: MatchInfo[] = [];
  const matched = match(scriptWords(spec.script), heardWords(json), info);
  if (!matched) fail(`vo-align ${id}: the voice doesn't match the script. Re-record, or fix the script and vo/${id}.txt.`);
  const words = tidy(snapToAudio(matched.map((w) => ({ ...w })), await decodeMono(clean, 48000), 48000));
  writeJson(paths.words(id), words);
  const q = alignReport(id, words, info);
  console.log(
    `✔ vo-align ${id}: ${words.length} words matched (${q.exact} exact, ${q.split} split, ${q.merged} merged), Whisper confidence ${q.meanP} mean / ${q.minP} lowest, boundaries moved ${q.meanShiftMs} ms on average (max ${q.maxShiftMs} ms) → ${path.relative(process.cwd(), paths.words(id))} (whisper ${MODEL})`,
  );
  return words;
}

/**
 * The alignment report (out/checks/<ID>.align.json and .md): per word, what Whisper heard, how it
 * matched the script, Whisper's confidence, and how far snapping to the audio moved its start and end.
 */
function alignReport(id: string, words: Word[], info: MatchInfo[]) {
  const rows = words.map((w, i) => {
    const m = info[i]!;
    return {
      word: w.word,
      heard: m.heard,
      kind: m.kind,
      p: +m.p.toFixed(2),
      whisper: [+m.whisperStart.toFixed(3), +m.whisperEnd.toFixed(3)],
      final: [w.start, w.end],
      startShiftMs: Math.round((w.start - m.whisperStart) * 1000),
      endShiftMs: Math.round((w.end - m.whisperEnd) * 1000),
    };
  });
  const shifts = rows.flatMap((r) => [Math.abs(r.startShiftMs), Math.abs(r.endShiftMs)]);
  const summary = {
    words: rows.length,
    exact: rows.filter((r) => r.kind === "exact").length,
    split: rows.filter((r) => r.kind === "split").length,
    merged: rows.filter((r) => r.kind === "merged").length,
    meanP: +(rows.reduce((a, r) => a + r.p, 0) / rows.length).toFixed(2),
    minP: Math.min(...rows.map((r) => r.p)),
    lowConfidence: rows.filter((r) => r.p < 0.6).map((r) => r.word),
    meanShiftMs: Math.round(shifts.reduce((a, b) => a + b, 0) / shifts.length),
    maxShiftMs: Math.max(...shifts),
  };
  ensureDir(paths.checks);
  const file = path.join(paths.checks, `${id}.align.json`);
  writeJson(file, { id, model: MODEL, summary, rows });
  const md = [
    `# vo-align ${id}`,
    "",
    `Whisper ${MODEL}, one word per segment, boundaries snapped to the audio (up to ${SNAP * 1000} ms). ${summary.words} words: ${summary.exact} heard exactly, ${summary.split} heard in pieces, ${summary.merged} heard merged with a neighbour. Whisper's confidence: ${summary.meanP} on average, lowest ${summary.minP}${summary.lowConfidence.length ? ` (under 0.6: ${summary.lowConfidence.join(", ")})` : ""}. Snapping moved word boundaries ${summary.meanShiftMs} ms on average, at most ${summary.maxShiftMs} ms.`,
    "",
    "| # | Word | Heard | Match | Confidence | Whisper (s) | Final (s) | Start moved (ms) | End moved (ms) |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((r, i) => `| ${i + 1} | ${r.word} | ${r.heard} | ${r.kind} | ${r.p} | ${r.whisper[0]}–${r.whisper[1]} | ${r.final[0]}–${r.final[1]} | ${r.startShiftMs} | ${r.endShiftMs} |`),
    "",
  ];
  writeFileSync(file.replace(/\.json$/, ".md"), md.join("\n"));
  return summary;
}

if (process.argv[1]?.endsWith("vo-align.ts")) {
  await alignVoice(idArg());
}
