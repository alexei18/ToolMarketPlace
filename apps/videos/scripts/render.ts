/*
 * npm run video:render <ID>
 * Blocked unless the latest video-check passed and nothing changed since. Renders H.264 MP4 with AAC
 * (voice only, no music) to out/[<batch>/]<ID>.mp4, the TikTok cover still at the hook frame, and a
 * side-by-side check image (real page | video frame) for every UI scene in out/checks/.
 *
 * A motion-kit video also gets its music and sound effects, a final mix, and the checks only the
 * finished file can answer (loudness, end silence, static frames). It stays <ID>.failed.mp4 until they pass.
 */
import { existsSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { captionPages } from "../src/lib/captions";
import { buildTimeline, FPS } from "../src/lib/timeline";
import { cardLayout, type CardCropSpec } from "../src/lib/cardcrop";
import { finalView, phoneLayout, type PhoneFrameSpec } from "../src/lib/phone";
import { buildKitTimeline, type MusicAnalysis } from "../src/lib/kit-timeline";
import type { VideoSpec, Word } from "../src/lib/types";
import { findCue } from "../src/lib/words";
import { webpackOverride } from "../webpack-override";
import { ensureDir, fail, FFMPEG, FFPROBE, idArg, loadSpec, mtime, paths, ROOT, run, decodeMono, writeJson } from "./lib/common";
import { checkRender } from "./lib/kit-check";
import { endSilence, staticStretches } from "./lib/measure";
import { masterMix } from "./lib/mix";
import { silenceMap } from "./lib/silence";
import { dropInFile } from "./music-analyze";
import { measureLoudness } from "./vo-clean";
import { loadCaptures, type CheckReport } from "./video-check";

export async function bundleProject(): Promise<string> {
  console.log("Bundling…");
  return bundle({ entryPoint: path.join(ROOT, "src", "index.ts"), webpackOverride });
}

function gate(id: string): CheckReport {
  const file = paths.checkReport(id);
  if (!existsSync(file)) fail(`No video-check report for ${id}. Run: npm run video:prepare ${id}`);
  const report = JSON.parse(readFileSync(file, "utf8")) as CheckReport;
  if (!report.pass) fail(`video-check ${id} failed; rendering is blocked. See ${file.replace(/\.json$/, ".md")}`);
  for (const [file, checkedMtime] of Object.entries(report.inputs)) {
    if (mtime(path.join(ROOT, file)) !== checkedMtime) fail(`${file} changed after the last video-check. Run: npm run video:prepare ${id}`);
  }
  return report;
}

/** 3D needs the GPU through ANGLE on Windows; two tabs were the fastest on this kind of machine. */
const KIT_RENDER = { chromiumOptions: { gl: "angle" as const }, concurrency: 2, timeoutInMilliseconds: 240000 };

async function renderKitVideo(id: string, serveUrl?: string): Promise<{ output: string; cover: string; seconds: number; checks: string[] }> {
  const spec = loadSpec(id);
  const report = gate(id);
  const url = serveUrl ?? (await bundleProject());
  const composition = await selectComposition({ serveUrl: url, id, chromiumOptions: KIT_RENDER.chromiumOptions });
  const output = paths.out(spec);
  ensureDir(path.dirname(output));
  const draft = output.replace(/\.mp4$/, ".draft.mp4");
  const mastered = output.replace(/\.mp4$/, ".failed.mp4");
  await renderMedia({ ...KIT_RENDER, composition, serveUrl: url, codec: "h264", audioCodec: "aac", audioBitrate: "320k", crf: 18, pixelFormat: "yuv420p", imageFormat: "jpeg", jpegQuality: 95, outputLocation: draft });
  const mix = await masterMix(draft, mastered);

  // Grain changes every frame, so frozen shots are looked for on a small render without it.
  const proxy = path.join(paths.checks, `${id}.nograin.mp4`);
  await renderMedia({ ...KIT_RENDER, composition, serveUrl: url, codec: "h264", muted: true, crf: 10, scale: 0.25, imageFormat: "jpeg", jpegQuality: 95, inputProps: { noGrain: true }, outputLocation: proxy });
  const pauses = silenceMap(await decodeMono(paths.voClean(id), 48000), 48000).pauses;
  const loud = await measureLoudness(mastered);
  const twistAt = composition.props as unknown as { spec: VideoSpec; words: Word[]; music: MusicAnalysis };
  const tl = buildKitTimeline(id, spec.kit!, twistAt.words, twistAt.music, FPS);
  const dropOffFrames = Math.abs((await dropInFile(mastered)) * FPS - twistAt.words[tl.twistIndex]!.start * FPS);
  const measured = { lufs: loud.i, truePeak: loud.tp, endSilence: await endSilence(mastered), dropOffFrames: +dropOffFrames.toFixed(2), statics: await staticStretches(proxy) };
  const failures = checkRender(measured, pauses, FPS);
  writeJson(paths.checkReport(id).replace(/\.json$/, ".render.json"), { ...measured, mix, failures });
  if (failures.length) {
    for (const f of failures) console.error(`✖ ${f}`);
    fail(`${id} rendered, but the file doesn't pass: it stays at ${mastered}`);
  }
  renameSync(mastered, output);
  const cover = paths.cover(spec);
  await renderStill({ composition, serveUrl: url, output: cover, frame: report.stats.coverFrame, imageFormat: "png", chromiumOptions: KIT_RENDER.chromiumOptions });
  console.log(`✔ ${id} → ${path.relative(process.cwd(), output)}: ${measured.lufs} LUFS, ${measured.truePeak} dBTP, ${measured.endSilence} s of end silence`);
  return { output, cover, seconds: composition.durationInFrames / FPS, checks: [] };
}

export async function renderVideo(id: string, serveUrl?: string): Promise<{ output: string; cover: string; seconds: number; checks: string[] }> {
  const spec = loadSpec(id);
  if (spec.kit) return renderKitVideo(id, serveUrl);
  const report = gate(id);
  const url = serveUrl ?? (await bundleProject());
  const inputProps = { debugSafeZone: false };
  const composition = await selectComposition({ serveUrl: url, id, inputProps });

  const output = paths.out(spec);
  ensureDir(path.dirname(output));
  let last = -1;
  await renderMedia({
    composition,
    serveUrl: url,
    codec: "h264",
    audioCodec: "aac",
    audioBitrate: "192k",
    crf: 18,
    pixelFormat: "yuv420p",
    imageFormat: "jpeg",
    jpegQuality: 95,
    outputLocation: output,
    inputProps,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 10) * 10;
      if (pct !== last) process.stdout.write(`  rendering ${id}: ${(last = pct)}%\r`);
    },
  });
  console.log(`✔ ${id} → ${path.relative(process.cwd(), output)}            `);

  const cover = paths.cover(spec);
  await renderStill({ composition, serveUrl: url, output: cover, frame: report.stats.coverFrame, inputProps, imageFormat: "png" });
  console.log(`✔ cover (frame ${report.stats.coverFrame}) → ${path.relative(process.cwd(), cover)}`);

  // Side-by-side checks: the real page (same scroll) next to the video frame, for each UI scene.
  const words = JSON.parse(readFileSync(paths.words(id), "utf8")) as Word[];
  const tl = buildTimeline(spec, words, FPS);
  const captures = loadCaptures();
  const checks: string[] = [];
  ensureDir(paths.checks);
  for (const b of tl.beats) {
    if (b.scene !== "PhoneFrame" && b.scene !== "CardCrop") continue;
    const p = b.props as unknown as PhoneFrameSpec & CardCropSpec & { capture: string; state?: { cue: string; name: string; delayFrames?: number } };
    const meta = captures[p.capture]!;
    const at = (cue: string | undefined, plus: number) => {
      const i = cue ? findCue(words, cue) : -1;
      return i >= 0 ? Math.round(words[i]!.start * FPS) + plus : -1;
    };
    // Once everything has settled (scroll, zoom, state), inside the beat.
    const settle = Math.max(b.cueFrame + 20, at(p.scroll?.at(-1)?.cue, 14), at(p.zoom?.cue, 18), at(p.state?.cue, (p.state?.delayFrames ?? 0) + 4));
    const frame = Math.min(settle, b.from + b.durationInFrames - 1);
    const stateShown = p.state && at(p.state.cue, p.state.delayFrames ?? 0) <= frame ? p.state.name : "default";
    // The same part of the real page, in CSS px.
    let region: { x: number; y: number; w: number; h: number };
    if (b.scene === "PhoneFrame") {
      const view = finalView(meta, p);
      const { screen } = phoneLayout(meta);
      region = { x: view.x, y: view.y, w: view.w, h: (view.w * screen.h) / screen.w };
    } else {
      region = cardLayout(meta, p.target!).crop;
    }
    const px = (v: number) => Math.round(v * meta.scale);
    const still = path.join(paths.checks, `${id}-beat${b.index + 1}-frame.png`);
    await renderStill({ composition, serveUrl: url, output: still, frame, inputProps, imageFormat: "png" });
    const check = path.join(paths.checks, `${id}-beat${b.index + 1}.png`);
    await run(FFMPEG, [
      "-v", "error", "-y",
      "-i", path.join(ROOT, "public", meta.states[stateShown] ?? meta.states.default!),
      "-i", still,
      "-filter_complex", `[0:v]crop=${px(region.w)}:${px(region.h)}:${px(region.x)}:${px(region.y)},scale=1080:-2,pad=1120:1920:0:(1920-ih)/2:white[a];[a][1:v]hstack=inputs=2`,
      check,
    ]);
    checks.push(check);
    console.log(`✔ check beat ${b.index + 1} (${b.scene}, frame ${frame}): real ${meta.route} | video → ${path.relative(process.cwd(), check)}`);
  }

  // The file must be what TikTok expects.
  const probe = JSON.parse(
    (await run(FFPROBE, ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate:format=duration", "-of", "json", output])).stdout.toString(),
  ) as { streams: { codec_type: string; codec_name: string; width?: number; height?: number; r_frame_rate?: string }[]; format: { duration: string } };
  const v = probe.streams.find((s) => s.codec_type === "video");
  const a = probe.streams.find((s) => s.codec_type === "audio");
  if (v?.codec_name !== "h264" || v.width !== 1080 || v.height !== 1920 || v.r_frame_rate !== "30/1" || a?.codec_name !== "aac") {
    fail(`Unexpected output format: ${JSON.stringify(probe.streams)}`);
  }
  const seconds = Number(probe.format.duration);
  const pages = captionPages(words, tl, spec.style.keywords, FPS).length;
  console.log(`✔ ${id}: h264 1080×1920 30 fps + aac, ${seconds.toFixed(2)} s, ${tl.beats.length} beat(s), ${pages} caption page(s)`);
  return { output, cover, seconds, checks };
}

if (process.argv[1]?.endsWith("render.ts")) {
  await renderVideo(idArg());
}
