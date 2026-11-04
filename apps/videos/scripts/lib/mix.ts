/*
 * The final mix. Remotion sums the layers but knows nothing of loudness, so after the render the
 * whole soundtrack is brought to -14 LUFS with a gain and a limiter, encoded to AAC and put back
 * next to the untouched video stream. It is measured again after encoding, which can push peaks up.
 */
import { rmSync } from "node:fs";
import { measureLoudness } from "../vo-clean";
import { FFMPEG, run } from "./common";

export const TARGET_LUFS = -14;
export const LUFS_TOLERANCE = 1;
export const MAX_TRUE_PEAK = -1;
/** The limiter works on sample peaks; AAC and inter-sample peaks can land above them. */
const LIMITER_CEILING = -2.5;
const LIMIT = Math.pow(10, LIMITER_CEILING / 20).toFixed(4);

export async function masterMix(draft: string, final: string): Promise<{ lufs: number; truePeak: number; gainDb: number }> {
  let gain = TARGET_LUFS - (await measureLoudness(draft)).i;
  const encode = (g: number) =>
    run(FFMPEG, ["-hide_banner", "-y", "-i", draft, "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy", "-af", `volume=${g.toFixed(2)}dB,alimiter=limit=${LIMIT}:level=false:attack=1:release=50`, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", final]);
  let measured = { i: 0, tp: 0 };
  // Again while the limiter costs loudness.
  for (let pass = 0; pass < 5; pass++) {
    await encode(gain);
    measured = await measureLoudness(final);
    if (Math.abs(measured.i - TARGET_LUFS) <= 0.3) break;
    gain += TARGET_LUFS - measured.i;
  }
  rmSync(draft, { force: true });
  return { lufs: measured.i, truePeak: measured.tp, gainDb: +gain.toFixed(2) };
}
