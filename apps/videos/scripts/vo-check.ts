/*
 * The gate before rendering. Fails on: pauses over 0.35 s, a first word later than 0.3 s, any beat
 * starting more than 3 frames from its cue word, captions outside 2–4 words or the safe zone or on
 * top of the UI the voice talks about, a script that differs from vo/<ID>.txt or the voice, and
 * missing captures. Writes out/checks/<ID>.vo-check.json and .md; render.ts refuses to run unless
 * the latest report passed and is newer than its inputs.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CaptureMeta } from "../src/captures";
import { captionPages } from "../src/lib/captions";
import { CAPTION_BOXES, inside, intersects, SAFE } from "../src/lib/layout";
import { beatFocus } from "../src/lib/phone";
import { buildTimeline, FPS } from "../src/lib/timeline";
import type { Word } from "../src/lib/types";
import { normalizeWord, scriptWords } from "../src/lib/words";
import { captionPosition } from "../src/scenes/names";
import { decodeMono, ensureDir, fail, idArg, loadSpec, mtime, narrationMatchesSpec, paths, ROOT, writeJson } from "./lib/common";
import { silenceMap } from "./lib/silence";

export const LIMITS = { maxPause: 0.35, maxFirstWord: 0.3, maxBeatOffsetFrames: 3, captionWords: [2, 4] as const };

export interface CheckReport {
  id: string;
  pass: boolean;
  checkedAt: string;
  /** Inputs and their modification times when checked; render.ts compares them. */
  inputs: Record<string, number>;
  failures: string[];
  stats: { voiceSeconds: number; videoSeconds: number; words: number; wordsPerSecond: number; firstWordAt: number; longestPause: number; durationInFrames: number; coverFrame: number };
  /** Silences in the cleaned voice (measured in the audio, not from word timestamps). */
  pauses: { between: string; at: number; seconds: number; ok: boolean }[];
  beats: { beat: number; scene: string; cue: string; cueAt: number; cueFrame: number; startFrame: number; offsetFrames: number; ok: boolean }[];
  captions: { from: number; text: string; position: string; ok: boolean; problem?: string }[];
}

export function loadCaptures(): Record<string, CaptureMeta> {
  if (!existsSync(paths.captures)) return {};
  return Object.fromEntries(
    readdirSync(paths.captures)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const meta = JSON.parse(readFileSync(path.join(paths.captures, f), "utf8")) as CaptureMeta;
        return [meta.name, meta];
      }),
  );
}

export async function checkVoice(id: string): Promise<CheckReport> {
  const spec = loadSpec(id);
  const failures: string[] = [];
  const wordsFile = paths.words(id);
  if (!existsSync(wordsFile)) fail(`No ${wordsFile}: run vo-align first`);
  const words = JSON.parse(readFileSync(wordsFile, "utf8")) as Word[];

  const narration = narrationMatchesSpec(spec);
  if (narration) failures.push(narration);
  const spoken = words.map((w) => normalizeWord(w.word)).join(" ");
  const written = scriptWords(spec.script).map(normalizeWord).join(" ");
  if (spoken !== written) failures.push(`words.json doesn't match the script; run vo-align again`);
  if (mtime(wordsFile) < mtime(paths.voClean(id))) failures.push(`words.json is older than the cleaned voice; run vo-align again`);
  if (mtime(paths.voClean(id)) < mtime(paths.voRaw(id))) failures.push(`the cleaned voice is older than vo/${id}.wav; run vo-clean again`);

  const tl = buildTimeline(spec, words, FPS);
  const first = words[0]!;
  if (first.start > LIMITS.maxFirstWord) failures.push(`first word starts at ${first.start.toFixed(2)} s (max ${LIMITS.maxFirstWord} s)`);

  // Pauses are measured in the audio itself: Whisper's word ends are not precise enough.
  const audio = silenceMap(await decodeMono(paths.voClean(id), 48000), 48000);
  const firstSound = Math.max(0, audio.first) * audio.hop;
  if (firstSound > LIMITS.maxFirstWord) failures.push(`the voice starts at ${firstSound.toFixed(2)} s (max ${LIMITS.maxFirstWord} s)`);
  const around = (t: number) => {
    const before = [...words].reverse().find((w) => w.start < t);
    const after = words.find((w) => w.start >= t);
    return `${before?.word ?? "start"} / ${after?.word ?? "end"}`;
  };
  const pauses = audio.pauses.map((p) => {
    const seconds = +(p.to - p.from).toFixed(3);
    return { between: around(p.from), at: +p.from.toFixed(2), seconds, ok: seconds <= LIMITS.maxPause };
  });
  for (const p of pauses.filter((x) => !x.ok)) failures.push(`pause of ${p.seconds.toFixed(2)} s at ${p.at} s (${p.between}) (max ${LIMITS.maxPause} s)`);

  const beats = tl.beats.map((b) => {
    const cueAt = words[b.cueIndex]!.start;
    // The first beat also covers the frames before the first word; its entrance runs on the cue frame.
    const startFrame = b.index === 0 ? b.cueFrame : b.from;
    const offset = startFrame - cueAt * FPS;
    const ok = Math.abs(offset) <= LIMITS.maxBeatOffsetFrames;
    if (!ok) failures.push(`beat ${b.index + 1} (${b.scene}) starts ${offset.toFixed(1)} frames from its cue "${b.cue}"`);
    return { beat: b.index + 1, scene: b.scene, cue: b.cue, cueAt: +cueAt.toFixed(3), cueFrame: b.cueFrame, startFrame, offsetFrames: +offset.toFixed(2), ok };
  });

  const captures = loadCaptures();
  for (const b of spec.beats) {
    if (b.scene !== "PhoneFrame") continue;
    const name = (b.props as { capture?: string } | undefined)?.capture;
    const meta = name ? captures[name] : undefined;
    if (!meta) failures.push(`capture "${name}" is missing: run npm run video:capture ${id}`);
    else for (const file of Object.values(meta.states)) if (!existsSync(path.join(paths.captures, "..", file))) failures.push(`capture file ${file} is missing`);
  }

  // Key UI (what the voice talks about) must sit inside TikTok's safe zone.
  spec.beats.forEach((b, i) => {
    try {
      const focus = beatFocus(b, captures);
      if (focus && !inside(focus, SAFE)) failures.push(`beat ${i + 1}: the UI the voice talks about (${focus.x.toFixed(0)},${focus.y.toFixed(0)} ${focus.w.toFixed(0)}×${focus.h.toFixed(0)}) leaves the safe zone`);
    } catch (e) {
      failures.push(`beat ${i + 1}: ${(e as Error).message}`);
    }
  });

  const pages = captionPages(words, tl, spec.style.keywords, FPS);
  const captions = pages.map((p) => {
    const b = tl.beats[p.beat]!;
    const position = captionPosition(b);
    const text = p.words.map((w) => w.text).join(" ");
    let problem: string | undefined;
    if (p.words.length < LIMITS.captionWords[0] || p.words.length > LIMITS.captionWords[1]) problem = `${p.words.length} words (2–4 per page)`;
    if (position !== "none") {
      const box = CAPTION_BOXES[position];
      let focus;
      try {
        focus = beatFocus(spec.beats[p.beat]!, captures);
      } catch (e) {
        problem = (e as Error).message;
      }
      if (!inside(box, SAFE)) problem = "caption box outside the safe zone";
      else if (focus && intersects(box, focus)) problem = `covers the UI the voice talks about (beat ${p.beat + 1})`;
    }
    if (problem) failures.push(`caption "${text}": ${problem}`);
    return { from: p.from, text, position, ok: !problem, ...(problem ? { problem } : {}) };
  });

  const voiceSeconds = +(words[words.length - 1]!.end - first.start).toFixed(2);
  const report: CheckReport = {
    id,
    pass: failures.length === 0,
    checkedAt: new Date().toISOString(),
    inputs: Object.fromEntries([paths.spec(id), paths.voTxt(id), paths.voRaw(id), paths.voClean(id), wordsFile].map((f) => [path.relative(ROOT, f).split(path.sep).join("/"), mtime(f)])),
    failures,
    stats: {
      voiceSeconds,
      videoSeconds: +(tl.durationInFrames / FPS).toFixed(2),
      words: words.length,
      wordsPerSecond: +(words.length / voiceSeconds).toFixed(2),
      firstWordAt: first.start,
      longestPause: Math.max(0, ...pauses.map((p) => p.seconds)),
      durationInFrames: tl.durationInFrames,
      coverFrame: tl.coverFrame,
    },
    pauses,
    beats,
    captions,
  };
  ensureDir(paths.checks);
  writeJson(paths.checkReport(id), report);
  writeFileSync(paths.checkReport(id).replace(/\.json$/, ".md"), markdown(report));
  return report;
}

function markdown(r: CheckReport): string {
  const s = r.stats;
  const lines = [
    `# vo-check ${r.id}: ${r.pass ? "PASS" : "FAIL"}`,
    "",
    `Checked ${r.checkedAt}. Voice ${s.voiceSeconds} s, video ${s.videoSeconds} s (${s.durationInFrames} frames at ${FPS} fps), ${s.words} words, ${s.wordsPerSecond} words/s, first word at ${s.firstWordAt} s, longest pause ${s.longestPause.toFixed(2)} s, cover frame ${s.coverFrame}.`,
    "",
    ...(r.failures.length ? ["## Failures", "", ...r.failures.map((f) => `- ${f}`), ""] : []),
    "## Beats (start vs cue word)",
    "",
    "| Beat | Scene | Cue | Cue at (s) | Cue frame | Start frame | Offset (frames) | OK |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...r.beats.map((b) => `| ${b.beat} | ${b.scene} | ${b.cue} | ${b.cueAt} | ${b.cueFrame} | ${b.startFrame} | ${b.offsetFrames} | ${b.ok ? "yes" : "**no**"} |`),
    "",
    `## Pauses (max ${LIMITS.maxPause} s)`,
    "",
    "Measured as silence in the cleaned voice.",
    "",
    "| Between | At (s) | Pause (s) | OK |",
    "| --- | --- | --- | --- |",
    ...r.pauses.map((p) => `| ${p.between} | ${p.at} | ${p.seconds.toFixed(2)} | ${p.ok ? "yes" : "**no**"} |`),
    "",
    "## Caption pages",
    "",
    "| From frame | Text | Position | OK |",
    "| --- | --- | --- | --- |",
    ...r.captions.map((c) => `| ${c.from} | ${c.text} | ${c.position} | ${c.ok ? "yes" : `**no**: ${c.problem}`} |`),
    "",
  ];
  return lines.join("\n");
}

if (process.argv[1]?.endsWith("vo-check.ts")) {
  const r = await checkVoice(idArg());
  console.log(`${r.pass ? "✔" : "✖"} vo-check ${r.id}: ${r.pass ? "PASS" : "FAIL"} — report in ${path.relative(process.cwd(), paths.checkReport(r.id).replace(/\.json$/, ".md"))}`);
  for (const f of r.failures) console.log(`  - ${f}`);
  if (!r.pass) process.exit(1);
}
