/*
 * npm run refs:sheets
 * For each reference video in refs/ (study only, not in git, never in a render): contact sheets with a
 * frame every 0.25 s around its hook, its twist (where the music drops) and its ending, plus a
 * spectrogram of the whole sound, into out/refs/<name>/. Read them, then write the notes in
 * docs/video-references.md.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { dropInFile } from "./music-analyze";
import { durationOf, fail, FFMPEG, ROOT, run } from "./lib/common";

const dir = path.join(ROOT, "refs");
const videos = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(mp4|mov|webm|mkv)$/i.test(f)) : [];
if (videos.length === 0) fail(`No videos in ${dir}`);

for (const video of videos) {
  const file = path.join(dir, video);
  const out = path.join(ROOT, "out", "refs", video.replace(/\.[^.]+$/, ""));
  mkdirSync(out, { recursive: true });
  const seconds = await durationOf(file);
  const twist = await dropInFile(file);
  const sections: [string, number, number][] = [
    ["hook", 0, Math.min(4, seconds)],
    ["twist", Math.max(0, twist - 3), Math.min(seconds, twist + 3)],
    ["ending", Math.max(0, seconds - 5), seconds],
  ];
  for (const [name, from, to] of sections) {
    const rows = Math.ceil(((to - from) * 4) / 8);
    await run(FFMPEG, ["-v", "error", "-y", "-ss", String(from), "-to", String(to), "-i", file, "-vf", `fps=4,scale=240:-2,tile=8x${rows}:padding=4:color=0x333333`, "-frames:v", "1", "-q:v", "3", path.join(out, `${name}.jpg`)]);
  }
  await run(FFMPEG, ["-v", "error", "-y", "-i", file, "-lavfi", "showspectrumpic=s=1600x500:legend=1:scale=log:fscale=log", path.join(out, "spectrogram.png")]);
  console.log(`✔ ${video}: ${seconds.toFixed(1)} s, music jumps at ${twist.toFixed(2)} s → ${path.relative(process.cwd(), out)}`);
}
