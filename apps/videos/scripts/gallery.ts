/*
 * npm run video:gallery
 * Renders the StyleGallery to out/kit/StyleGallery.mp4, masters its sound, makes a contact sheet with
 * one row per item and a frame every 0.25 s, and reports the render time per second of video.
 */
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { GALLERY, GALLERY_TOTAL } from "../src/kit/gallery-list";
import { FPS } from "../src/lib/timeline";
import { FFMPEG, ROOT, run, writeJson } from "./lib/common";
import { masterMix } from "./lib/mix";
import { bundleProject } from "./render";

/** One row per item, a frame every 0.25 s: every frame comes out of one pass over the file. */
export async function contactSheet(file: string, outDir: string): Promise<string> {
  const stills = path.join(outDir, "sheet");
  rmSync(stills, { recursive: true, force: true });
  mkdirSync(stills);
  await run(FFMPEG, ["-v", "error", "-y", "-i", file, "-vf", "fps=4,scale=135:240", "-q:v", "4", path.join(stills, "f%05d.jpg")]);
  const cols = Math.ceil(Math.max(...GALLERY.map((i) => i.frames)) / (FPS / 4));
  const blank = path.join(stills, "blank.jpg");
  await run(FFMPEG, ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x222222:s=135x240", "-frames:v", "1", blank]);
  const list: string[] = [];
  let at = 0;
  for (const item of GALLERY) {
    const cells = Math.round(item.frames / (FPS / 4));
    for (let c = 0; c < cols; c++) list.push(c < cells ? `f${String(at + c + 1).padStart(5, "0")}.jpg` : "blank.jpg");
    at += cells;
  }
  const concat = path.join(stills, "list.txt");
  writeFileSync(concat, list.map((f) => `file '${f}'`).join("\n") + "\n");
  const sheet = path.join(outDir, "StyleGallery-sheet.jpg");
  await run(FFMPEG, ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", concat, "-vf", `tile=${cols}x${GALLERY.length}:padding=3:color=0x444444`, "-frames:v", "1", "-q:v", "3", sheet]);
  rmSync(stills, { recursive: true, force: true });
  return sheet;
}

const gl = "angle" as const;
const dir = path.join(ROOT, "out", "kit");
mkdirSync(dir, { recursive: true });
const draft = path.join(dir, "StyleGallery.draft.mp4");
const final = path.join(dir, "StyleGallery.mp4");

const t0 = Date.now();
const serveUrl = await bundleProject();
const composition = await selectComposition({ serveUrl, id: "StyleGallery", chromiumOptions: { gl } });

// When each frame finished, to tell which items cost what.
const doneAt: number[] = [];
let lastPct = -1;
await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  audioCodec: "aac",
  audioBitrate: "320k",
  crf: 18,
  // Grain is expensive: without a ceiling it takes nearly 50 Mbit/s for no visible gain.
  encodingMaxRate: "16M",
  encodingBufferSize: "32M",
  pixelFormat: "yuv420p",
  imageFormat: "jpeg",
  jpegQuality: 95,
  concurrency: 2,
  outputLocation: draft,
  chromiumOptions: { gl },
  timeoutInMilliseconds: 240000,
  onProgress: ({ progress, renderedFrames }) => {
    doneAt[renderedFrames] ??= Date.now();
    const pct = Math.floor(progress * 20) * 5;
    if (pct !== lastPct) console.log(`  ${(lastPct = pct)}% after ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  },
});
const rendered = (Date.now() - t0) / 1000;
const mix = await masterMix(draft, final);

const seconds = GALLERY_TOTAL / FPS;
/** When frame n was done; progress updates can skip a few. */
const timeAt = (n: number) => {
  for (let f = n; f >= 0; f--) if (doneAt[f]) return doneAt[f]!;
  return t0;
};
let from = 0;
const items = GALLERY.map((item) => {
  const a = timeAt(from);
  const b = timeAt(from + item.frames);
  from += item.frames;
  const spent = Math.max(0, (b - a) / 1000);
  return { name: item.name, seconds: +(item.frames / FPS).toFixed(1), renderSeconds: +spent.toFixed(1), perSecond: +(spent / (item.frames / FPS)).toFixed(1) };
});

const sheet = await contactSheet(final, dir);

const fileMb = +(statSync(final).size / 1048576).toFixed(1);
const report = { fileMb, seconds: +seconds.toFixed(1), frames: GALLERY_TOTAL, renderSeconds: +rendered.toFixed(1), renderSecondsPerSecondOfVideo: +(rendered / seconds).toFixed(1), mix, items };
writeJson(path.join(dir, "StyleGallery.report.json"), report);
console.log(`✔ ${path.relative(process.cwd(), final)}: ${report.seconds} s rendered in ${report.renderSeconds} s = ${report.renderSecondsPerSecondOfVideo} s per second of video, ${mix.lufs} LUFS, ${mix.truePeak} dBTP, ${fileMb} MB`);
console.log(`✔ ${path.relative(process.cwd(), sheet)}`);
