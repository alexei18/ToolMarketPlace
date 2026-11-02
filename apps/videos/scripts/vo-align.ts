/*
 * public/vo/<ID>.wav → vo/<ID>.words.json: word-level timestamps from whisper.cpp (installed by
 * @remotion/install-whisper-cpp into .whisper/, DTW token timing), matched against the script.
 * Any word that doesn't match the script stops the pipeline with a table of the differences.
 * The words are stored as written in the script, with Whisper's timings.
 */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { downloadWhisperModel, installWhisperCpp, transcribe, type WhisperModel } from "@remotion/install-whisper-cpp";
import type { Word } from "../src/lib/types";
import { normalizeWord, scriptWords } from "../src/lib/words";
import { decodeMono, FFMPEG, fail, idArg, loadSpec, paths, ROOT, run, writeJson } from "./lib/common";
import { silenceMap } from "./lib/silence";

const WHISPER_DIR = path.join(ROOT, ".whisper");
const WHISPER_VERSION = "1.5.5";
const MODEL = (process.env.WHISPER_MODEL ?? "small.en") as WhisperModel;

interface Heard {
  text: string;
  start: number;
  end: number;
}

/** Whisper in one-word-per-segment mode: each item is a word with its start and end. */
function heardWords(json: Awaited<ReturnType<typeof transcribe<false>>>): Heard[] {
  return json.transcription
    .map((item) => ({ text: item.text.trim(), start: item.offsets.from / 1000, end: item.offsets.to / 1000 }))
    .filter((w) => normalizeWord(w.text) !== "");
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
function match(script: string[], heard: Heard[]): Word[] | null {
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
      h++;
      continue;
    }
    // One script word heard as several pieces.
    let joined = normalizeWord(got.text);
    let k = h + 1;
    while (k < heard.length && joined.length < want.length && want.startsWith(joined)) joined += normalizeWord(heard[k++]!.text);
    if (joined === want) {
      out.push({ word: script[s]!, start: got.start, end: heard[k - 1]!.end });
      h = k;
      continue;
    }
    // Several script words heard as one: share its time evenly.
    let parts = want;
    let j = s + 1;
    while (j < script.length && parts.length < normalizeWord(got.text).length) parts += normalizeWord(script[j++]!);
    if (parts === normalizeWord(got.text)) {
      const n = j - s;
      for (let q = 0; q < n; q++) out.push({ word: script[s + q]!, start: got.start + ((got.end - got.start) * q) / n, end: got.start + ((got.end - got.start) * (q + 1)) / n });
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

  const matched = match(scriptWords(spec.script), heardWords(json));
  if (!matched) fail(`vo-align ${id}: the voice doesn't match the script. Re-record, or fix the script and vo/${id}.txt.`);
  const words = tidy(snapToAudio(matched, await decodeMono(clean, 48000), 48000));
  writeJson(paths.words(id), words);
  console.log(`✔ vo-align ${id}: ${words.length} words matched → ${path.relative(process.cwd(), paths.words(id))} (whisper ${MODEL})`);
  return words;
}

if (process.argv[1]?.endsWith("vo-align.ts")) {
  await alignVoice(idArg());
}
