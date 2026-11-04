/* Paths, spec loading, process and audio helpers shared by the pipeline scripts. */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { VideoSpec } from "../../src/lib/types";
import { normalizeWord, scriptWords } from "../../src/lib/words";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

export const paths = {
  spec: (id: string) => path.join(ROOT, "specs", `${id}.json`),
  /** Narration + style instruction (for Google AI Studio). */
  voTxt: (id: string) => path.join(ROOT, "vo", `${id}.txt`),
  /** The recorded or generated voice, as delivered. Never modified. */
  voRaw: (id: string) => path.join(ROOT, "vo", `${id}.wav`),
  words: (id: string) => path.join(ROOT, "vo", `${id}.words.json`),
  cleanReport: (id: string) => path.join(ROOT, "vo", `${id}.clean.json`),
  /** The cleaned voice the video plays. */
  voClean: (id: string) => path.join(ROOT, "public", "vo", `${id}.wav`),
  captures: path.join(ROOT, "public", "captures"),
  checks: path.join(ROOT, "out", "checks"),
  checkReport: (id: string) => path.join(ROOT, "out", "checks", `${id}.video-check.json`),
  out: (spec: VideoSpec) => path.join(ROOT, "out", spec.batch ?? "", `${spec.id}.mp4`),
  cover: (spec: VideoSpec) => path.join(ROOT, "out", spec.batch ?? "", `${spec.id}.cover.png`),
};

export function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

export function idArg(): string {
  const id = process.argv[2];
  if (!id || id.startsWith("-")) fail("Usage: <script> <VIDEO_ID>   e.g. TEST-01");
  return id;
}

export function loadSpec(id: string): VideoSpec {
  const file = paths.spec(id);
  if (!existsSync(file)) fail(`No spec at ${file}`);
  const spec = JSON.parse(readFileSync(file, "utf8")) as VideoSpec;
  if (spec.id !== id) fail(`${file}: "id" is "${spec.id}", expected "${id}"`);
  for (const key of ["concept", "script", "beats", "style", "endscreen"] as const) if (!spec[key]) fail(`${file}: missing "${key}"`);
  return spec;
}

/** The narration in vo/<ID>.txt: everything after the line "---". */
export function loadNarration(id: string): string {
  const file = paths.voTxt(id);
  if (!existsSync(file)) fail(`No narration file at ${file}`);
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const i = text.indexOf("\n---\n");
  if (i < 0) fail(`${file}: put the narration after a line with "---" (style instruction above it)`);
  return text.slice(i + 5).trim();
}

/** Script and narration file must say the same words. */
export function narrationMatchesSpec(spec: VideoSpec): string | null {
  const a = scriptWords(spec.script).map(normalizeWord).join(" ");
  const b = scriptWords(loadNarration(spec.id)).map(normalizeWord).join(" ");
  return a === b ? null : `specs/${spec.id}.json "script" and vo/${spec.id}.txt differ:\n  spec: ${a}\n  txt:  ${b}`;
}

export function mtime(file: string): number {
  return existsSync(file) ? statSync(file).mtimeMs : 0;
}

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function writeJson(file: string, data: unknown): void {
  ensureDir(path.dirname(file));
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

/** Runs a command; resolves with stdout and stderr, rejects on a non-zero exit. */
export function run(cmd: string, args: string[], opts: { input?: Buffer } = {}): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (d: Buffer) => out.push(d));
    p.stderr.on("data", (d: Buffer) => (err += d.toString()));
    p.on("error", (e) => reject(new Error(`${cmd} could not start (${e.message}). Install it or set ${cmd === FFMPEG ? "FFMPEG_PATH" : "the path"}.`)));
    p.on("close", (code) => (code === 0 ? resolve({ stdout: Buffer.concat(out), stderr: err }) : reject(new Error(`${cmd} ${args.join(" ")}\nexited with ${code}\n${err.slice(-2000)}`))));
    if (opts.input) p.stdin.end(opts.input);
    else p.stdin.end();
  });
}

/** Decodes any audio file to mono float samples at `rate` Hz. */
export async function decodeMono(file: string, rate: number): Promise<Float32Array> {
  const { stdout } = await run(FFMPEG, ["-v", "error", "-i", file, "-ac", "1", "-ar", String(rate), "-f", "f32le", "-"]);
  return new Float32Array(stdout.buffer, stdout.byteOffset, stdout.byteLength / 4);
}

/** Writes mono 16-bit PCM WAV. */
export function writeWav(file: string, samples: Float32Array, rate: number): void {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 32767), i * 2);
  writeFileSync(file, Buffer.concat([wavHeader(data.length, rate, 1, 16), data]));
}

/** A WAV header for raw PCM (e.g. ElevenLabs pcm_24000). */
export function wavHeader(dataBytes: number, rate: number, channels: number, bits: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + dataBytes, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE((rate * channels * bits) / 8, 28);
  h.writeUInt16LE((channels * bits) / 8, 32);
  h.writeUInt16LE(bits, 34);
  h.write("data", 36);
  h.writeUInt32LE(dataBytes, 40);
  return h;
}

export async function durationOf(file: string): Promise<number> {
  const { stdout } = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(stdout.toString().trim());
}

/** Runs a script of this folder as a child process (prepare, batch). */
export function runScript(name: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const tsx = path.join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
    const p = spawn(tsx, [path.join(ROOT, "scripts", `${name}.ts`), ...args], { stdio: "inherit", shell: process.platform === "win32" });
    p.on("close", (code) => resolve(code ?? 1));
  });
}
