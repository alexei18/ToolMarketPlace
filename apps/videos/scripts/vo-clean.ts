/*
 * npm run video:prepare runs this first. vo/<ID>.wav → public/vo/<ID>.wav:
 * 1. trim the silence before the first and after the last word;
 * 2. shorten every internal pause longer than 0.25 s to 0.18 s;
 * 3. if the speech is slower than 2.6 words/s, speed it up 5–10 % (atempo keeps the pitch);
 * 4. bring the loudness to -14 LUFS with a gain and a -1.5 dBTP limiter, measured with loudnorm.
 * Only silent stretches are removed, keeping 90 ms of silence next to each word, so no word is cut.
 * The original file is never changed.
 */
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { scriptWords } from "../src/lib/words";
import { decodeMono, durationOf, ensureDir, FFMPEG, fail, idArg, loadSpec, paths, run, writeJson, writeWav } from "./lib/common";
import { silenceMap } from "./lib/silence";

const RATE = 48000;
const MAX_PAUSE = 0.25;
const KEEP_PAUSE = 0.18;
const HEAD_KEEP = 0.02;
const TAIL_KEEP = 0.06;
const MIN_RATE = 2.6; // words per second
const TARGET_RATE = 2.75;
const TARGET_LUFS = -14;
const TRUE_PEAK = -1.5;
/** The limiter works on sample peaks; true (inter-sample) peaks land up to ~1 dB higher, so it aims lower. */
const LIMITER_CEILING = TRUE_PEAK - 1;

/** Integrated loudness and true peak of a file (ffmpeg loudnorm's measurement). */
export async function measureLoudness(file: string, filter = ""): Promise<{ i: number; tp: number }> {
  const { stderr } = await run(FFMPEG, ["-hide_banner", "-i", file, "-af", `${filter}loudnorm=print_format=json`, "-f", "null", "-"]);
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
  const tempo = rate < MIN_RATE ? Math.min(1.1, Math.max(1.05, TARGET_RATE / rate)) : 1;

  const tmp = mkdtempSync(path.join(os.tmpdir(), "vo-clean-"));
  try {
    const trimmed = path.join(tmp, "trimmed.wav");
    writeWav(trimmed, out, RATE);
    const tempoFilter = tempo !== 1 ? `atempo=${tempo.toFixed(3)},` : "";
    const final = paths.voClean(id);
    ensureDir(path.dirname(final));
    // Gain to the target, limited to the true-peak ceiling; once more if the limiter cost loudness.
    let gain = TARGET_LUFS - (await measureLoudness(trimmed, tempoFilter)).i;
    let measured = { i: 0, tp: 0 };
    for (let pass = 0; pass < 3; pass++) {
      await run(FFMPEG, [
        "-hide_banner", "-y", "-i", trimmed,
        "-af", `${tempoFilter}volume=${gain.toFixed(2)}dB,alimiter=limit=${Math.pow(10, LIMITER_CEILING / 20).toFixed(4)}:level=false:attack=1:release=50`,
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
      tempo: +tempo.toFixed(3),
      finalSeconds: +finalSeconds.toFixed(3),
      wordsPerSecondAfter: +(wordCount / finalSeconds).toFixed(2),
      loudnessLufs: measured.i,
      truePeakDb: measured.tp,
    };
    writeJson(paths.cleanReport(id), report);
    console.log(
      `✔ vo-clean ${id}: ${report.originalSeconds}s → ${report.finalSeconds}s, ${cuts.length} pause(s) shortened, ` +
        `${report.wordsPerSecondBefore} → ${report.wordsPerSecondAfter} words/s${tempo !== 1 ? ` (atempo ${report.tempo})` : ""}, ${report.loudnessLufs} LUFS, ${report.truePeakDb} dBTP`,
    );
    return report;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith("vo-clean.ts")) {
  await cleanVoice(idArg());
}
