/* Measurements of a rendered file: frames that don't change, silence at the end. */
import { FFMPEG, run } from "./common";

/** Scale of the frames compared, and how different a pixel must be to count as changed (out of 255). */
const W = 270;
const H = 480;
const PIXEL_DIFF = 2;
/** Pixels that must change for a frame to count as moving: a few, so a small moving point still counts. */
const MIN_CHANGED = 4;

/**
 * Stretches of frames with no change. Compares the frames themselves, so run it on a render without
 * grain: animated grain changes every pixel of every frame and would hide a frozen shot.
 */
export async function staticStretches(file: string): Promise<{ from: number; to: number }[]> {
  const { stdout } = await run(FFMPEG, ["-v", "error", "-i", file, "-vf", `scale=${W}:${H}:flags=area`, "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
  const size = W * H;
  const frames = Math.floor(stdout.length / size);
  const out: { from: number; to: number }[] = [];
  let start = -1;
  for (let f = 1; f < frames; f++) {
    let changed = 0;
    const a = (f - 1) * size;
    const b = f * size;
    for (let i = 0; i < size && changed < MIN_CHANGED; i++) if (Math.abs(stdout[a + i]! - stdout[b + i]!) >= PIXEL_DIFF) changed++;
    const still = changed < MIN_CHANGED;
    if (still && start < 0) start = f - 1;
    if (!still && start >= 0) {
      out.push({ from: start, to: f - 1 });
      start = -1;
    }
  }
  if (start >= 0) out.push({ from: start, to: frames - 1 });
  return out;
}

/** Seconds of silence (under -50 dB) before the end of the file. */
export async function endSilence(file: string): Promise<number> {
  const { stderr } = await run(FFMPEG, ["-hide_banner", "-i", file, "-af", "silencedetect=noise=-50dB:d=0.05", "-f", "null", "-"]);
  const duration = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr);
  const total = duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : 0;
  const starts = [...stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  // A silence still open at the end has a start and no end, or ends at the very end of the file.
  const last = starts.at(-1);
  if (last === undefined) return 0;
  const closed = ends.at(-1);
  if (starts.length > ends.length) return +(total - last).toFixed(3);
  return closed !== undefined && total - closed < 0.05 ? +(total - last).toFixed(3) : 0;
}
