/*
 * npm run sfx:synth
 * Generates every sound effect the kit needs into public/sfx/, plus manifest.json with each file's
 * source and license. Seeded, so it always writes the same bytes. These are our own work, so there
 * is no license question; a licensed pack can replace any of them by changing its manifest entry
 * (SoundLayer plays whatever the manifest says).
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import type { CueType } from "../src/kit/cues";
import { ensureDir, ROOT, writeWav } from "./lib/common";

const RATE = 48000;
const TAU = Math.PI * 2;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const buffer = (seconds: number) => new Float32Array(Math.round(seconds * RATE));
const white = (n: Float32Array, seed: number) => {
  const r = rng(seed);
  for (let i = 0; i < n.length; i++) n[i] = r() * 2 - 1;
  return n;
};

/** A resonant filter whose cutoff can move over time: `cut(t)` in Hz, t in seconds. */
function filter(input: Float32Array, kind: "low" | "high" | "band", cut: (t: number) => number, q = 0.8) {
  const out = new Float32Array(input.length);
  let ic1 = 0;
  let ic2 = 0;
  for (let i = 0; i < input.length; i++) {
    const g = Math.tan((Math.PI * Math.min(cut(i / RATE), RATE * 0.45)) / RATE);
    const k = 1 / q;
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = input[i]! - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    out[i] = kind === "low" ? v2 : kind === "band" ? v1 : input[i]! - k * v1 - v2;
  }
  return out;
}

/** Multiplies by an envelope, t in seconds. */
function shape(x: Float32Array, env: (t: number) => number) {
  for (let i = 0; i < x.length; i++) x[i]! *= env(i / RATE);
  return x;
}

/** A sine whose frequency moves over time. */
function sine(seconds: number, freq: (t: number) => number) {
  const x = buffer(seconds);
  let phase = 0;
  for (let i = 0; i < x.length; i++) {
    phase += (TAU * freq(i / RATE)) / RATE;
    x[i] = Math.sin(phase);
  }
  return x;
}

/** Mixes tracks with gains into one, as long as the longest. */
function mix(...parts: [Float32Array, number][]) {
  const out = new Float32Array(Math.max(...parts.map(([p]) => p.length)));
  for (const [p, g] of parts) for (let i = 0; i < p.length; i++) out[i]! += p[i]! * g;
  return out;
}

const softClip = (x: Float32Array, drive: number) => x.map((v) => Math.tanh(v * drive) / Math.tanh(drive));

/** Short decaying noise that gives transients some space. */
function tail(seconds: number, seed: number, decay: number, cutoff: number) {
  return shape(filter(white(buffer(seconds), seed), "low", () => cutoff), (t) => Math.exp(-t * decay));
}

/** Peak at -3 dB, a 1 ms fade so no file clicks at its edges. */
function finish(x: Float32Array, loop = false) {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 0.708 / peak : 1;
  const fade = loop ? 0 : Math.round(0.001 * RATE);
  return x.map((v, i) => v * gain * Math.min(1, fade ? Math.min(i / fade + 0.25, (x.length - 1 - i) / fade) : 1));
}

function whoosh(seconds: number, seed: number, from: number, peak: number, to: number) {
  const mid = seconds * 0.55;
  const cut = (t: number) => (t < mid ? from * Math.pow(peak / from, t / mid) : peak * Math.pow(to / peak, (t - mid) / (seconds - mid)));
  const env = (t: number) => Math.pow(Math.sin(Math.PI * Math.min(1, t / seconds)), 1.6);
  return shape(filter(white(buffer(seconds), seed), "band", cut, 1.1), env);
}

function riser(seconds: number, seed: number) {
  const rise = (t: number) => Math.pow(t / seconds, 2.2);
  const noise = shape(filter(white(buffer(seconds), seed), "band", (t) => 300 * Math.pow(30, t / seconds), 1.4), rise);
  const a = shape(sine(seconds, (t) => 90 * Math.pow(9, t / seconds)), rise);
  const b = shape(sine(seconds, (t) => 136 * Math.pow(9, t / seconds)), rise);
  return mix([noise, 1], [a, 0.35], [b, 0.25]);
}

function impact(seconds: number, seed: number, sub: number, drive: number) {
  const body = shape(sine(seconds, (t) => 42 + (sub - 42) * Math.exp(-t * 26)), (t) => Math.exp(-t * (4.2 / seconds)));
  const crack = shape(filter(white(buffer(0.09), seed), "high", () => 900), (t) => Math.exp(-t * 60));
  return softClip(mix([body, 1], [crack, 0.5], [tail(seconds, seed + 1, 3.4 / seconds, 1400), 0.22]), drive);
}

function key(seed: number) {
  const r = rng(seed);
  const thump = shape(sine(0.05, () => 150 + r() * 40), (t) => Math.exp(-t * 110));
  const click = shape(filter(white(buffer(0.03), seed + 1), "high", () => 2400 + r() * 800), (t) => Math.exp(-t * 240));
  const release = new Float32Array(Math.round(0.07 * RATE));
  release.set(shape(filter(white(buffer(0.015), seed + 2), "high", () => 3200), (t) => Math.exp(-t * 400)), Math.round(0.05 * RATE));
  return mix([thump, 0.7], [click, 1], [release, 0.3]);
}

/** Random sample-and-hold bursts: an error of the machine, on purpose. */
function glitch(seconds: number, seed: number) {
  const r = rng(seed);
  const x = buffer(seconds);
  let i = 0;
  while (i < x.length) {
    const len = Math.round((0.008 + r() * 0.05) * RATE);
    const on = r() > 0.28;
    const hold = 8 + Math.floor(r() * 60);
    const freq = 80 + r() * 2400;
    let held = 0;
    for (let j = 0; j < len && i + j < x.length; j++) {
      if (j % hold === 0) held = r() * 2 - 1;
      x[i + j] = on ? 0.6 * held + 0.4 * Math.sign(Math.sin((TAU * freq * j) / RATE)) : 0;
    }
    i += len;
  }
  return shape(x, (t) => Math.pow(1 - t / seconds, 0.6));
}

/** One sound per cue type. A type with several files gets one per variant (keys don't all sound alike). */
const SOUNDS: Record<CueType, { gainDb: number; make: () => Float32Array[] }> = {
  // Under everything: a low, slowly breathing room. Its ends match, so it loops without a seam.
  roomtone: {
    gainDb: -40,
    make: () => {
      const n = filter(white(buffer(8), 11), "low", () => 180, 0.7);
      const len = n.length;
      const xf = Math.round(0.5 * RATE);
      const out = new Float32Array(len - xf);
      for (let i = 0; i < out.length; i++) out[i] = i < xf ? n[i]! * (i / xf) + n[len - xf + i]! * (1 - i / xf) : n[i]!;
      return [out];
    },
  },
  swell: { gainDb: -14, make: () => [mix([shape(sine(2.6, (t) => 44 + t * 6), (t) => Math.pow(Math.sin((Math.PI * t) / 2.6), 2)), 1], [shape(filter(white(buffer(2.6), 21), "low", () => 260), (t) => Math.pow(Math.sin((Math.PI * t) / 2.6), 2)), 0.25])] },
  impact: { gainDb: -9, make: () => [impact(1.2, 31, 150, 1.6)] },
  impactHeavy: { gainDb: -5, make: () => [impact(2.2, 41, 190, 2.6)] },
  shimmer: {
    gainDb: -20,
    make: () => {
      const r = rng(51);
      const partials = Array.from({ length: 14 }, () => 2400 + r() * 7000);
      const x = buffer(1.1);
      for (let i = 0; i < x.length; i++) {
        const t = i / RATE;
        for (const f of partials) x[i]! += Math.sin(TAU * f * t + f) * (0.6 + 0.4 * Math.sin(TAU * (6 + f / 900) * t));
      }
      const air = filter(white(buffer(1.1), 52), "high", () => 6000);
      return [shape(mix([x, 0.06], [air, 0.35]), (t) => Math.min(1, t / 0.12) * Math.exp(-t * 3.4))];
    },
  },
  whooshSoft: { gainDb: -16, make: () => [whoosh(0.75, 61, 220, 1900, 300)] },
  whooshShort: { gainDb: -17, make: () => [whoosh(0.26, 62, 500, 4200, 900)] },
  swoosh: { gainDb: -16, make: () => [whoosh(0.5, 63, 400, 5600, 1400)] },
  glitch: { gainDb: -18, make: () => [glitch(0.55, 71)] },
  clickDry: { gainDb: -19, make: () => [mix([shape(sine(0.03, () => 2300), (t) => Math.exp(-t * 340)), 0.8], [shape(filter(white(buffer(0.02), 81), "high", () => 3000), (t) => Math.exp(-t * 500)), 0.7])] },
  clickUi: {
    gainDb: -17,
    make: () => {
      const press = shape(filter(white(buffer(0.02), 91), "band", () => 1800, 1.6), (t) => Math.exp(-t * 300));
      const release = new Float32Array(Math.round(0.08 * RATE));
      release.set(shape(filter(white(buffer(0.015), 92), "band", () => 2600, 1.6), (t) => Math.exp(-t * 420)), Math.round(0.06 * RATE));
      return [mix([press, 1], [release, 0.55])];
    },
  },
  key: { gainDb: -21, make: () => [key(101), key(102), key(103), key(104)] },
  tick: { gainDb: -20, make: () => [mix([shape(sine(0.02, () => 3100), (t) => Math.exp(-t * 500)), 0.8], [shape(sine(0.02, () => 1400), (t) => Math.exp(-t * 400)), 0.5])] },
  riserShort: { gainDb: -19, make: () => [riser(0.9, 111)] },
  riser: { gainDb: -14, make: () => [riser(1.8, 112)] },
  pop: { gainDb: -19, make: () => [shape(sine(0.09, (t) => 340 + 900 * Math.min(1, t / 0.018) * Math.exp(-t * 26)), (t) => Math.min(1, t / 0.002) * Math.exp(-t * 46))] },
  tone: { gainDb: -18, make: () => [mix([shape(sine(1.4, () => 523.25), (t) => Math.min(1, t / 0.01) * Math.exp(-t * 3)), 1], [shape(sine(1.4, () => 1046.5), (t) => Math.min(1, t / 0.01) * Math.exp(-t * 4.6)), 0.35], [shape(sine(1.4, () => 1569.8), (t) => Math.min(1, t / 0.01) * Math.exp(-t * 7)), 0.12])] },
};

const dir = path.join(ROOT, "public", "sfx");
ensureDir(dir);
const manifest: Record<string, { files: string[]; seconds: number; gainDb: number; source: string; license: string }> = {};
for (const [type, sound] of Object.entries(SOUNDS)) {
  const variants = sound.make();
  const files = variants.map((x, i) => {
    const name = variants.length > 1 ? `${type}-${i + 1}.wav` : `${type}.wav`;
    writeWav(path.join(dir, name), finish(x, type === "roomtone"), RATE);
    return name;
  });
  manifest[type] = {
    files,
    seconds: +(Math.max(...variants.map((v) => v.length)) / RATE).toFixed(3),
    gainDb: sound.gainDb,
    source: "Generated by scripts/sfx-synth.ts",
    license: "Own work; commercial use allowed",
  };
}
writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`✔ ${Object.keys(manifest).length} cue types → public/sfx/`);
