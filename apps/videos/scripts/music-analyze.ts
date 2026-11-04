/*
 * npm run music:analyze [folder]
 * For each track in public/music (or the folder given): the beats, the drop and the loudness, written
 * next to it as <track>.analysis.json. The compositions place the track so its drop lands on the twist.
 *
 * The drop is where the bass and the overall energy jump the most and stay up. A weak jump is
 * reported as not found rather than guessed: then write <track>.drop.json with { "seconds": n } after
 * listening. The beats are one steady grid (tempo and phase fitted over the section after the drop),
 * each beat then moved to the real onset within 30 ms, so a slightly loose track still lines up.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { MusicAnalysis } from "../src/lib/kit-timeline";
import { decodeMono, fail, ROOT, writeJson } from "./lib/common";
import { measureLoudness } from "./vo-clean";

const RATE = 22050;
const HOP = 128;
const HOP_S = HOP / RATE;
const TRACK = /\.(mp3|wav|flac|m4a)$/i;
/** Below this jump in dB the drop isn't trusted. */
const MIN_JUMP = 6;

function envelopes(x: Float32Array) {
  const n = Math.floor(x.length / HOP);
  const low = new Float32Array(n);
  const all = new Float32Array(n);
  const a = 1 - Math.exp((-2 * Math.PI * 150) / RATE);
  let lp = 0;
  for (let f = 0; f < n; f++) {
    let sl = 0;
    let sa = 0;
    for (let i = f * HOP; i < (f + 1) * HOP; i++) {
      lp += a * (x[i]! - lp);
      sl += lp * lp;
      sa += x[i]! * x[i]!;
    }
    low[f] = 10 * Math.log10(sl / HOP + 1e-9);
    all[f] = 10 * Math.log10(sa / HOP + 1e-9);
  }
  return { low, all };
}

/** Rise in energy per hop, summed over the bass and the full band: peaks where something hits. */
function onsets(low: Float32Array, all: Float32Array) {
  const out = new Float32Array(low.length);
  const back = 3;
  for (let f = back; f < low.length; f++) out[f] = Math.max(0, low[f]! - low[f - back]!) + Math.max(0, all[f]! - all[f - back]!);
  return out;
}

const mean = (a: Float32Array, from: number, to: number) => {
  let s = 0;
  const end = Math.min(to, a.length);
  for (let i = Math.max(0, from); i < end; i++) s += a[i]!;
  return s / Math.max(1, end - Math.max(0, from));
};

export function findDrop(low: Float32Array, all: Float32Array, flux: Float32Array): { at: number; jump: number } {
  const win = Math.round(4 / HOP_S);
  const step = Math.round(0.05 / HOP_S);
  let best = { f: 0, jump: -Infinity };
  for (let f = Math.round(1.5 / HOP_S); f < low.length - win / 2; f += step) {
    const jump = mean(low, f, f + win) - mean(low, f - win, f) + 0.5 * (mean(all, f, f + win) - mean(all, f - win, f));
    if (jump > best.jump) best = { f, jump };
  }
  // The strongest hit close to the jump is the drop itself.
  const reach = Math.round(0.4 / HOP_S);
  let peak = best.f;
  for (let f = Math.max(0, best.f - reach); f < Math.min(flux.length, best.f + reach); f++) if (flux[f]! > flux[peak]!) peak = f;
  return { at: peak * HOP_S, jump: best.jump };
}

/** Comb score of a beat period and phase over a section, in hops. */
function comb(flux: Float32Array, start: number, end: number, period: number, phase: number) {
  let s = 0;
  let n = 0;
  for (let t = start + phase; t < end; t += period) {
    const i = Math.round(t);
    // A hit can fall a hop or two either side of a fractional grid point.
    s += Math.max(flux[i] ?? 0, flux[i - 1] ?? 0, flux[i + 1] ?? 0);
    n++;
  }
  return n ? s / n : 0;
}

export function fitTempo(flux: Float32Array, start: number, end: number): { period: number; phase: number } {
  let best = { score: -Infinity, period: 0, phase: 0 };
  const search = (from: number, to: number, stepBpm: number) => {
    for (let bpm = from; bpm <= to; bpm += stepBpm) {
      const period = 60 / bpm / HOP_S;
      // A gentle preference for ordinary tempos, so a track isn't read at half or double speed.
      const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 122) / 1.1, 2));
      for (let phase = 0; phase < period; phase += 1) {
        const score = comb(flux, start, end, period, phase) * prior;
        if (score > best.score) best = { score, period, phase };
      }
    }
  };
  search(70, 180, 0.5);
  const coarse = (60 / best.period) / HOP_S;
  search(coarse - 1, coarse + 1, 0.02);
  return { period: best.period, phase: best.phase };
}

/** Where the drop really is in a finished mix, in seconds. */
export async function dropInFile(file: string): Promise<number> {
  const { low, all } = envelopes(await decodeMono(file, RATE));
  return findDrop(low, all, onsets(low, all)).at;
}

export function analyzeSamples(samples: Float32Array, override?: number) {
  const { low, all } = envelopes(samples);
  const flux = onsets(low, all);
  const found = findDrop(low, all, flux);
  const dropAt = override ?? found.at;
  const dropHop = Math.round(dropAt / HOP_S);
  const end = Math.min(flux.length, dropHop + Math.round(30 / HOP_S));
  const { period, phase } = fitTempo(flux, dropHop, end);
  const seconds = samples.length / RATE;
  const beats: number[] = [];
  const first = (dropHop + phase) % period;
  for (let t = first; t * HOP_S < seconds; t += period) {
    // Move the beat to the real hit, when there's one within 30 ms.
    const reach = Math.round(0.03 / HOP_S);
    const c = Math.round(t);
    let peak = c;
    let v = 0;
    for (let f = c - reach; f <= c + reach; f++) {
      if ((flux[f] ?? 0) > v) {
        v = flux[f]!;
        peak = f;
      }
    }
    beats.push(+(((v > 3 ? peak : t) * HOP_S).toFixed(4)));
  }
  return { bpm: +((60 / period / HOP_S).toFixed(2)), beats, dropAt, jump: found.jump, seconds };
}

export async function analyzeFile(file: string): Promise<MusicAnalysis> {
  const overrideFile = file.replace(TRACK, ".drop.json");
  const override = existsSync(overrideFile) ? (JSON.parse(readFileSync(overrideFile, "utf8")) as { seconds: number }).seconds : undefined;
  const samples = await decodeMono(file, RATE);
  const r = analyzeSamples(samples, override);
  // The drop is the beat nearest to it when the grid agrees; a track can also drop off the grid.
  const nearest = r.beats.reduce((a, b) => (Math.abs(b - r.dropAt) < Math.abs(a - r.dropAt) ? b : a), r.beats[0] ?? r.dropAt);
  const onGrid = Math.abs(nearest - r.dropAt) < 0.06;
  const loudness = await measureLoudness(file);
  return {
    file: path.basename(file),
    seconds: +r.seconds.toFixed(3),
    bpm: r.bpm,
    beats: r.beats,
    drop: { at: +(onGrid ? nearest : r.dropAt).toFixed(4), jumpDb: +r.jump.toFixed(1), source: override !== undefined ? "override" : r.jump >= MIN_JUMP ? "detected" : "weak" },
    lufs: loudness.i,
    truePeak: loudness.tp,
  };
}

if (process.argv[1]?.endsWith("music-analyze.ts")) {
  const dir = path.resolve(ROOT, process.argv[2] ?? "public/music");
  if (!existsSync(dir)) fail(`No folder ${dir}. Put the tracks in public/music with their license proof.`);
  const tracks = readdirSync(dir).filter((f) => TRACK.test(f));
  if (tracks.length === 0) fail(`No tracks in ${dir}`);
  for (const t of tracks) {
    const file = path.join(dir, t);
    const a = await analyzeFile(file);
    writeJson(file.replace(TRACK, ".analysis.json"), a);
    const licensed = readdirSync(dir).some((f) => f.startsWith(`${t.replace(TRACK, "")}.license.`));
    console.log(`${a.drop.source === "weak" ? "⚠" : "✔"} ${t}: ${a.bpm} BPM, ${a.beats.length} beats, drop at ${a.drop.at} s (${a.drop.source}, +${a.drop.jumpDb} dB), ${a.lufs} LUFS${licensed ? "" : " — no license proof next to it"}`);
    if (a.drop.source === "weak") console.log(`  The drop isn't clear. Listen, then write ${t.replace(TRACK, ".drop.json")} with {"seconds": n} and run this again.`);
  }
}
