/*
 * The gate before rendering. Fails on: pauses over 0.35 s, a first word later than 0.3 s, any beat
 * starting more than 3 frames from its cue word, captions outside 2–4 words or one line, outside
 * the video's one band or on top of the UI the voice talks about, a scene whose main element is more than 8 px off the center
 * line x = 540 or outside its zone, UI the voice talks about outside the safe zone or with text
 * under 40 px (names) / 32 px (other text), a script that differs from vo/<ID>.txt or the voice,
 * missing captures, a script that doesn't end with "Join the waitlist, link in bio.", more than
 * 0.8 s of silence at the end, a batch script outside 75–90 words, colors under 4.5:1 contrast,
 * a dark video with the light endscreen, and a CardCrop captured under device scale 3.
 * Warns (doesn't fail) on a pace outside 2.8–3.5 words/s and on any shot that holds longer than
 * 1.5 s without a meaningful change. Writes out/checks/<ID>.vo-check.json and .md; render.ts
 * refuses to run unless the latest report passed and is newer than its inputs.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CaptureMeta } from "../src/captures";
import { CAPTION_FONT, captionFontSize, captionPages } from "../src/lib/captions";
import { CAPTION_BANDS, CENTER_X, centerX, DECOR, inside, intersects, MAX_CENTER_OFFSET, SAFE } from "../src/lib/layout";
import { beatFocus, mainElement, MIN_TEXT, talkedAbout, TEXT_BLOCK, type MainElement } from "../src/lib/stage";
import { longHolds, MAX_HOLD_SECONDS, screenEvents } from "../src/lib/events";
import { captionColors, contrast, over, themeColors, uiSceneBg } from "../src/lib/theme";
import { buildTimeline, CTA, END_TAIL_SECONDS, FPS } from "../src/lib/timeline";
import type { Word } from "../src/lib/types";
import { normalizeWord, scriptWords } from "../src/lib/words";
import { captionBand, showsCaptions } from "../src/scenes/names";
import { decodeMono, ensureDir, fail, idArg, loadSpec, mtime, narrationMatchesSpec, paths, ROOT, writeJson } from "./lib/common";
import { silenceMap } from "./lib/silence";

export const LIMITS = {
  maxPause: 0.35,
  maxFirstWord: 0.3,
  maxBeatOffsetFrames: 3,
  captionWords: [2, 4] as const,
  maxCenterOffset: MAX_CENTER_OFFSET,
  /** Silence after the last sound until the video ends. */
  maxEndSilence: 0.8,
  /** Words per second of the recorded voice (warning outside). */
  pace: [2.8, 3.5] as const,
  /** Script length for batch videos. */
  scriptWords: [75, 90] as const,
  minContrast: 4.5,
  cardCropScale: 3,
};

export interface CheckReport {
  id: string;
  pass: boolean;
  checkedAt: string;
  /** Inputs and their modification times when checked; render.ts compares them. */
  inputs: Record<string, number>;
  failures: string[];
  /** Worth a look, but don't block the render. */
  warnings: string[];
  stats: { voiceSeconds: number; videoSeconds: number; words: number; wordsPerSecond: number; firstWordAt: number; longestPause: number; endSilence: number; longestHold: number; durationInFrames: number; coverFrame: number };
  /** Silences in the cleaned voice (measured in the audio, not from word timestamps). */
  pauses: { between: string; at: number; seconds: number; ok: boolean }[];
  beats: { beat: number; scene: string; cue: string; cueAt: number; cueFrame: number; startFrame: number; offsetFrames: number; ok: boolean }[];
  captions: { from: number; text: string; position: string; ok: boolean; problem?: string }[];
  /** Each scene's main element: centered on x = 540, inside its zone. */
  layout: { beat: string; scene: string; what: string; centerX: number; offset: number; ok: boolean; problem?: string }[];
  /** The UI the voice talks about: where it lands and how large its smallest text is, video px. */
  ui: { beat: number; scene: string; target: string; box: string; name?: number; secondary?: number; ok: boolean; problem?: string }[];
  /** Text and background pairs of the video's theme. */
  contrast: { what: string; fg: string; bg: string; ratio: number; ok: boolean }[];
  /** Stretches with no meaningful change (warning above 1.5 s). */
  holds: { from: number; until: number; seconds: number; beat: number; after: string }[];
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
    if (b.scene !== "PhoneFrame" && b.scene !== "CardCrop") continue;
    const name = (b.props as { capture?: string } | undefined)?.capture;
    const meta = name ? captures[name] : undefined;
    if (!meta) failures.push(`capture "${name}" is missing: run npm run video:capture ${id}`);
    else for (const file of Object.values(meta.states)) if (!existsSync(path.join(paths.captures, "..", file))) failures.push(`capture file ${file} is missing`);
  }

  // Every scene's main element is centered on x = 540: critical content inside the safe zone,
  // decorative frames (the phone) inside the decoration zone.
  const layoutRow = (beat: string, scene: string, m: MainElement) => {
    const offset = +(centerX(m.rect) - CENTER_X).toFixed(1);
    const zone = m.what === "phone" ? DECOR : SAFE;
    let problem: string | undefined;
    if (Math.abs(offset) > LIMITS.maxCenterOffset) problem = `${m.what} is ${offset} px off the center line x = ${CENTER_X} (max ${LIMITS.maxCenterOffset})`;
    else if (!inside(m.rect, zone)) problem = `${m.what} (${m.rect.x.toFixed(0)},${m.rect.y.toFixed(0)} ${m.rect.w.toFixed(0)}×${m.rect.h.toFixed(0)}) leaves the ${zone === DECOR ? "decoration" : "safe"} zone`;
    if (problem) failures.push(`${beat === "end" ? "endscreen" : `beat ${beat}`} (${scene}): ${problem}`);
    return { beat, scene, what: m.what, centerX: +centerX(m.rect).toFixed(1), offset, ok: !problem, ...(problem ? { problem } : {}) };
  };
  const layout: CheckReport["layout"] = [];
  spec.beats.forEach((b, i) => {
    try {
      layout.push(layoutRow(String(i + 1), b.scene, mainElement(b, captures)));
    } catch (e) {
      failures.push(`beat ${i + 1}: ${(e as Error).message}`);
    }
  });
  layout.push(layoutRow("end", "Endscreen", { what: "text block", rect: TEXT_BLOCK }));

  // The UI the voice talks about sits inside the safe zone, its text at least 40 px (names) and
  // 32 px (other text) once settled.
  const ui: CheckReport["ui"] = [];
  spec.beats.forEach((b, i) => {
    try {
      const items = b.focus ? [{ target: "focus", box: b.focus }] : talkedAbout(b, captures);
      for (const u of items) {
        const r = u.box;
        const name = "name" in u && u.name !== undefined ? +u.name.toFixed(1) : undefined;
        const secondary = "secondary" in u && u.secondary !== undefined ? +u.secondary.toFixed(1) : undefined;
        const problems: string[] = [];
        if (!inside(r, SAFE)) problems.push("leaves the safe zone");
        if (name !== undefined && name < MIN_TEXT.name) problems.push(`names are ${name} px (min ${MIN_TEXT.name})`);
        if (secondary !== undefined && secondary < MIN_TEXT.secondary) problems.push(`text is ${secondary} px (min ${MIN_TEXT.secondary})`);
        const problem = problems.join(", ") || undefined;
        if (problem) failures.push(`beat ${i + 1} (${b.scene}): "${u.target}" ${problem}`);
        ui.push({ beat: i + 1, scene: b.scene, target: u.target, box: `${r.x.toFixed(0)},${r.y.toFixed(0)} ${r.w.toFixed(0)}×${r.h.toFixed(0)}`, name, secondary, ok: !problem, ...(problem ? { problem } : {}) });
      }
    } catch (e) {
      failures.push(`beat ${i + 1}: ${(e as Error).message}`);
    }
  });

  // Captions: one band for the whole video, centered on x = 540, one line per page.
  for (const [i, b] of spec.beats.entries()) {
    const c = b.captions as string | undefined;
    if (c && c !== "show" && c !== "none") failures.push(`beat ${i + 1}: captions "${c}": the caption band is per video (style.captions: "top" or "bottom"); a beat can only say "show" or "none"`);
  }
  const band = captionBand(spec);
  const pages = captionPages(words, tl, spec.style.keywords, FPS);
  const captions = pages.map((p) => {
    const b = tl.beats[p.beat]!;
    // The CTA's words are on the endscreen itself, no captions there.
    const position = p.from >= tl.endscreenFrom ? "endscreen" : showsCaptions(b) ? band : "none";
    const text = p.words.map((w) => w.text).join(" ");
    let problem: string | undefined;
    if (p.words.length < LIMITS.captionWords[0] || p.words.length > LIMITS.captionWords[1]) problem = `${p.words.length} words (2–4 per page)`;
    else if (position === band && captionFontSize(text, CAPTION_BANDS[band].w) < CAPTION_FONT.min) problem = "too long for one line in the 720 px band";
    if (position === band && !problem) {
      const box = CAPTION_BANDS[band];
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
  const warnings: string[] = [];

  // The spoken CTA closes every script; the endscreen starts on its "Join".
  if (tl.ctaIndex < 0) failures.push(`the script doesn't end with "${CTA}" (the endscreen starts on its "Join")`);
  // No silent tail: the video ends END_TAIL_SECONDS after the last word.
  const lastSound = (audio.last + 1) * audio.hop;
  const endSilence = +(tl.durationInFrames / FPS - Math.min(lastSound, words[words.length - 1]!.end)).toFixed(2);
  if (endSilence > LIMITS.maxEndSilence) failures.push(`${endSilence} s of silence at the end (max ${LIMITS.maxEndSilence} s; the video ends ${END_TAIL_SECONDS} s after the last word)`);

  // Pace: the recorded tempo is kept, so a slow or rushed read means re-recording.
  const wps = words.length / voiceSeconds;
  if (wps < LIMITS.pace[0] || wps > LIMITS.pace[1]) warnings.push(`pace ${wps.toFixed(2)} words/s is outside ${LIMITS.pace[0]}–${LIMITS.pace[1]}; the tempo is not changed, so consider re-recording`);
  const scriptLength = scriptWords(spec.script).length;
  if (scriptLength < LIMITS.scriptWords[0] || scriptLength > LIMITS.scriptWords[1]) {
    const msg = `the script has ${scriptLength} words (batch scripts: ${LIMITS.scriptWords[0]}–${LIMITS.scriptWords[1]})`;
    if (spec.batch) failures.push(msg);
    else warnings.push(msg);
  }

  // Motion: no shot holds longer than 1.5 s without a meaningful change.
  const holds = longHolds(tl, screenEvents(tl, words, FPS), FPS);
  for (const h of holds) warnings.push(`${h.beat ? `beat ${h.beat}` : "endscreen"} holds ${h.seconds} s without a change (frames ${h.from}–${h.until}, after ${h.after}); max ${MAX_HOLD_SECONDS} s`);

  // Dark videos: the white wordmark (dark endscreen) and dark captions; every text pair readable.
  const theme = spec.style.theme;
  if (theme === "dark" && spec.endscreen !== "dark") failures.push(`a dark video needs the dark endscreen (the white wordmark), not "${spec.endscreen}"`);
  const t = themeColors(theme);
  const cap = captionColors(theme);
  const end = themeColors(spec.endscreen);
  const usesUi = spec.beats.some((b) => b.scene === "PhoneFrame" || b.scene === "CardCrop");
  const pairs: [string, string, string][] = [
    ["scene text", t.text, t.bg],
    ["scene accent text", t.accent, t.bg],
    ["captions", cap.text, over(cap.box, usesUi ? uiSceneBg(theme) : t.bg)],
    ["caption keywords", cap.accent, over(cap.box, usesUi ? uiSceneBg(theme) : t.bg)],
    ["endscreen \"Join the waitlist\"", end.text, end.bg],
    ["endscreen \"link in bio\"", end.accent, end.bg],
    ...(usesUi ? ([["\"Illustrative\" label", t.muted, uiSceneBg(theme)]] as [string, string, string][]) : []),
  ];
  const contrastRows = pairs.map(([what, fg, bg]) => {
    const ratio = +contrast(fg, bg).toFixed(2);
    const ok = ratio >= LIMITS.minContrast;
    if (!ok) failures.push(`${what}: contrast ${ratio}:1 (min ${LIMITS.minContrast}:1)`);
    return { what, fg, bg, ratio, ok };
  });

  // CardCrop enlarges a capture about 2.7 times: captured at device scale 3 it stays sharp.
  for (const [i, b] of spec.beats.entries()) {
    if (b.scene !== "CardCrop") continue;
    const meta = captures[(b.props as { capture?: string } | undefined)?.capture ?? ""];
    if (meta && meta.scale < LIMITS.cardCropScale) failures.push(`beat ${i + 1} (CardCrop): capture "${meta.name}" is at device scale ${meta.scale}; CardCrop captures use scale ${LIMITS.cardCropScale}`);
  }

  const report: CheckReport = {
    id,
    pass: failures.length === 0,
    checkedAt: new Date().toISOString(),
    inputs: Object.fromEntries([paths.spec(id), paths.voTxt(id), paths.voRaw(id), paths.voClean(id), wordsFile].map((f) => [path.relative(ROOT, f).split(path.sep).join("/"), mtime(f)])),
    failures,
    warnings,
    stats: {
      voiceSeconds,
      videoSeconds: +(tl.durationInFrames / FPS).toFixed(2),
      words: words.length,
      wordsPerSecond: +(words.length / voiceSeconds).toFixed(2),
      firstWordAt: first.start,
      longestPause: Math.max(0, ...pauses.map((p) => p.seconds)),
      endSilence,
      longestHold: Math.max(0, ...holds.map((h) => h.seconds)),
      durationInFrames: tl.durationInFrames,
      coverFrame: tl.coverFrame,
    },
    pauses,
    beats,
    captions,
    layout,
    ui,
    contrast: contrastRows,
    holds,
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
    `Checked ${r.checkedAt}. Voice ${s.voiceSeconds} s, video ${s.videoSeconds} s (${s.durationInFrames} frames at ${FPS} fps), ${s.words} words, ${s.wordsPerSecond} words/s, first word at ${s.firstWordAt} s, longest pause ${s.longestPause.toFixed(2)} s, silence at the end ${s.endSilence} s, longest hold without a change ${s.longestHold || "under 1.5"} s, cover frame ${s.coverFrame}.`,
    "",
    ...(r.failures.length ? ["## Failures", "", ...r.failures.map((f) => `- ${f}`), ""] : []),
    ...(r.warnings.length ? ["## Warnings", "", ...r.warnings.map((w) => `- ${w}`), ""] : []),
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
    `## Layout (main element centered on x = ${CENTER_X}, max ${LIMITS.maxCenterOffset} px off)`,
    "",
    "| Beat | Scene | Main element | Center x | Offset (px) | OK |",
    "| --- | --- | --- | --- | --- | --- |",
    ...r.layout.map((l) => `| ${l.beat} | ${l.scene} | ${l.what} | ${l.centerX} | ${l.offset} | ${l.ok ? "yes" : `**no**: ${l.problem}`} |`),
    "",
    `## UI the voice talks about (inside the safe zone; text at least ${MIN_TEXT.name} px for names, ${MIN_TEXT.secondary} px otherwise)`,
    "",
    ...(r.ui.length
      ? [
          "| Beat | Scene | Element | Box (x,y w×h) | Smallest name (px) | Smallest other text (px) | OK |",
          "| --- | --- | --- | --- | --- | --- | --- |",
          ...r.ui.map((u) => `| ${u.beat} | ${u.scene} | ${u.target} | ${u.box} | ${u.name ?? "–"} | ${u.secondary ?? "–"} | ${u.ok ? "yes" : `**no**: ${u.problem}`} |`),
        ]
      : ["None in this video."]),
    "",
    `## Contrast (min ${LIMITS.minContrast}:1)`,
    "",
    "| Text | Color | On | Ratio | OK |",
    "| --- | --- | --- | --- | --- |",
    ...r.contrast.map((c) => `| ${c.what} | ${c.fg} | ${c.bg} | ${c.ratio}:1 | ${c.ok ? "yes" : "**no**"} |`),
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
