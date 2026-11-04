/*
 * npm run video:selftest
 * Proves the checks catch what they claim to: music:analyze against tracks with known beats and
 * drops, the [beat] pause edit against synthetic speech, and video-check against one good video and
 * one broken copy per rule. A check that never fails proves nothing, so each rule must fail here.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { COUNTS } from "../src/kit/lib";
import type { KitBeatSpec, KitSpec, MusicAnalysis } from "../src/lib/kit-timeline";
import { FPS } from "../src/lib/timeline";
import type { VideoSpec, Word } from "../src/lib/types";
import { scriptWords } from "../src/lib/words";
import { FFMPEG, ROOT, run } from "./lib/common";
import { AI_STUDIO_STYLE, checkKit, checkRender, type KitInputs } from "./lib/kit-check";
import { staticStretches } from "./lib/measure";
import { silenceMap } from "./lib/silence";
import { dropSeconds, FIXTURES, makeTrack, writeFixtures } from "./music-fixture";
import { analyzeFile } from "./music-analyze";
import { setPauses } from "./vo-clean";

let passed = 0;
const failed: string[] = [];
function ok(name: string, condition: boolean, detail = "") {
  if (condition) passed++;
  else failed.push(`${name}${detail ? `: ${detail}` : ""}`);
  console.log(`${condition ? "✔" : "✖"} ${name}${detail ? ` (${detail})` : ""}`);
}

// ── music:analyze against known answers ─────────────────────────────────────
const dir = writeFixtures();
for (const f of FIXTURES) {
  const a = await analyzeFile(path.join(dir, `${f.name}.wav`));
  const dropError = Math.abs(a.drop.at - dropSeconds(f)) * FPS;
  ok(`${f.name}: drop within 1 frame`, dropError <= 1, `${dropError.toFixed(2)} frames, ${a.drop.source}`);
  ok(`${f.name}: tempo within 0.5%`, Math.abs(a.bpm - f.bpm) / f.bpm < 0.005, `${a.bpm} vs ${f.bpm}`);
  const truth = makeTrack(f).beats.filter((b) => b >= dropSeconds(f) - 0.01);
  const after = a.beats.filter((b) => b >= a.drop.at - 0.02);
  const worst = truth.slice(0, Math.min(truth.length, after.length)).reduce((m, t, i) => Math.max(m, Math.abs(t - after[i]!) * FPS), 0);
  ok(`${f.name}: beats after the drop within 1 frame`, worst <= 1, `worst ${worst.toFixed(2)} frames`);
}

// ── [beat]: exact pauses in the audio ───────────────────────────────────────
{
  const rate = 48000;
  const burst = (seconds: number) => Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => 0.5 * Math.sin(i * 0.05));
  const gap = (seconds: number) => new Float32Array(Math.round(seconds * rate));
  // Speech with a long pause (0.9 s, to shorten), a short one (0.05 s, to pad) and an unmarked one.
  const parts = [burst(0.5), gap(0.9), burst(0.5), gap(0.05), burst(0.5), gap(0.2), burst(0.5)];
  const x = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    x.set(p, pos);
    pos += p.length;
  }
  const edited = setPauses(x, rate, [
    { from: 0.5, to: 1.4, seconds: 0.6 },
    { from: 1.9, to: 1.95, seconds: 0.8 },
  ]);
  const pauses = silenceMap(edited, rate).pauses.map((p) => p.to - p.from);
  ok("[beat 0.6] shortened from 0.9 s, within 40 ms", Math.abs(pauses[0]! - 0.6) <= 0.04, `${pauses[0]!.toFixed(3)} s`);
  ok("[beat 0.8] padded from 0.05 s, within 40 ms", Math.abs(pauses[1]! - 0.8) <= 0.04, `${pauses[1]!.toFixed(3)} s`);
  ok("an unmarked pause isn't touched", Math.abs(pauses[2]! - 0.2) <= 0.02, `${pauses[2]!.toFixed(3)} s`);
}

// ── static frames ───────────────────────────────────────────────────────────
{
  const frozen = path.join(dir, "frozen.mp4");
  // A square moves for a second, holds for a second, moves again: the hold must be found, and only the hold.
  await run(FFMPEG, ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=270x480:r=30:d=3", "-f", "lavfi", "-i", "color=c=white:s=40x40:r=30:d=3", "-filter_complex", "[0][1]overlay=x='if(lt(t,1),t*60,if(lt(t,2),60,60+(t-2)*60))':y=100", "-c:v", "libx264", "-crf", "1", frozen]);
  const s = await staticStretches(frozen);
  const long = s.filter((r) => (r.to - r.from) / FPS > 0.5);
  ok("a frozen second is found", long.length === 1 && Math.abs(long[0]!.from - 30) <= 2 && Math.abs(long[0]!.to - 60) <= 2, JSON.stringify(long));
  const fails = checkRender({ lufs: -14, truePeak: -2, endSilence: 0, dropOffFrames: 0, statics: long }, [], FPS);
  ok("a frozen second fails the render check", fails.some((f) => f.includes("static")));
  ok("the same hold inside a marked [beat] passes", checkRender({ lufs: -14, truePeak: -2, endSilence: 0, dropOffFrames: 0, statics: long }, [{ from: 0.95, to: 2.05 }], FPS).length === 0);
}
const clean = { lufs: -14, truePeak: -2, endSilence: 0, dropOffFrames: 0, statics: [] };
ok("-16 LUFS fails", checkRender({ ...clean, lufs: -16 }, [], FPS).length === 1);
ok("a peak at -0.5 dBTP fails", checkRender({ ...clean, truePeak: -0.5 }, [], FPS).length === 1);
ok("0.4 s of end silence fails", checkRender({ ...clean, endSilence: 0.4 }, [], FPS).length === 1);
ok("a drop 2 frames from the twist in the file fails", checkRender({ ...clean, dropOffFrames: 2 }, [], FPS).length === 1);

// ── video-check: one good video, one broken copy per rule ───────────────────
const SCRIPT =
  "Somewhere, right now, someone just shipped the app you've been looking for. [beat 0.6] It took them a weekend. [beat 0.5] Tonight it has one visitor. [beat 0.4] Them. [beat 0.8] The good ones don't go viral. They go quiet. [beat 0.6] Unless someone's watching. Join the waitlist. Link in bio.";
const written = scriptWords(SCRIPT);
const BEAT_AFTER: Record<string, number> = { "for.": 0.6, "weekend.": 0.5, "visitor.": 0.4, "Them.": 0.8, "quiet.": 0.6 };
const fakeWords: Word[] = [];
const fakePauses: { from: number; to: number }[] = [];
let t = 0.1;
for (const word of written) {
  fakeWords.push({ word, start: +t.toFixed(3), end: +(t + 0.26).toFixed(3) });
  t += 0.3;
  const beat = BEAT_AFTER[word];
  if (beat) {
    fakePauses.push({ from: t - 0.04, to: t - 0.04 + beat });
    t += beat;
  }
}
const beatLen = 60 / 124;
const dropAt = 7.742;
const fakeMusic: MusicAnalysis = { file: "x.wav", seconds: 90, bpm: 124, beats: Array.from({ length: 170 }, (_, i) => +(i * beatLen).toFixed(4)), drop: { at: dropAt, jumpDb: 20, source: "detected" }, lufs: -16, truePeak: -2 };
const beats = [
  { at: { cue: "Somewhere" }, scene: "Stage", props: {}, caption: true, sfx: "whooshSoft" },
  { at: { cue: "It" }, scene: "HeadlineSlam", props: { lines: ["It took them", "a weekend."], wordFrames: { $words: "It took them a weekend." } } },
  { at: { cue: "Tonight" }, scene: "FloatCard", props: { capture: "kit-feed", target: "row1" }, caption: true },
  { at: { cue: "Them#2" }, scene: "HudFrame", props: { labels: { topLeft: "Top this week" } }, sfx: "impact" },
  { at: { cue: "The#2" }, scene: "Stage", props: {}, caption: true, sfx: "whooshSoft" },
  { at: { cue: "Unless" }, scene: "Stage", props: {}, caption: true, sfx: "whooshShort" },
  { at: { cue: "watching" }, scene: "ChromeMark", props: { camera: "revealSpin" }, stage: { drift: false } },
  { at: { musicBeat: 8 }, scene: "ListCascade", props: { capture: "kit-feed", boxes: "rows", count: 3, rowFrames: [0, 10, 20] }, sfx: "whooshShort" },
  { at: { musicBeat: 28 }, scene: "ChromeWordmark", props: { sweepAt: 14 }, stage: { drift: false } },
] as unknown as KitBeatSpec[];
const kit: KitSpec = { twist: { cue: "watching" }, music: "fixtures/x.wav", act2Beats: 28, cta: "Join the waitlist. Link in bio.", beats };
const goodSpec: VideoSpec = { id: "SELFTEST", concept: "test", script: SCRIPT, beats: [], style: { theme: "dark" }, endscreen: "dark", kit };
const sounds = JSON.parse(readFileSync(path.join(ROOT, "public", "sfx", "manifest.json"), "utf8")) as KitInputs["sounds"];
const sfxFiles = readdirSync(path.join(ROOT, "public", "sfx"));
const input = (over: Partial<KitInputs> = {}, kitOver: Partial<KitSpec> = {}, specOver: Partial<VideoSpec> = {}): KitInputs => ({
  spec: { ...goodSpec, ...specOver, kit: { ...kit, ...kitOver } },
  words: fakeWords,
  music: fakeMusic,
  musicLicensed: true,
  pauses: fakePauses,
  styleBlock: `STYLE: ${AI_STUDIO_STYLE}`,
  narration: SCRIPT,
  sounds,
  sfxFiles,
  fps: FPS,
  ...over,
});

const good = checkKit(input());
ok("the good video passes", good.failures.length === 0, good.failures.join(" | "));

function mustFail(name: string, needle: string, inp: KitInputs) {
  const r = checkKit(inp);
  ok(name, r.failures.some((f) => f.includes(needle)), r.failures.length ? r.failures[0]! : "no failure");
}
const withBeats = (edit: (b: KitBeatSpec[]) => void) => {
  const copy = JSON.parse(JSON.stringify(beats)) as KitBeatSpec[];
  edit(copy);
  return { beats: copy };
};
const framesWord = (w: string) => Math.round(fakeWords.find((x) => x.word === w)!.start * FPS);
mustFail("a cut between words", "frames from the nearest word", input({}, withBeats((b) => (b[2]!.at = { frame: framesWord("Tonight") + 6 }))));
mustFail("a cut off the music's beat", "frames from the nearest music beat", input({}, withBeats((b) => (b[7]!.at = { frame: framesWord("watching.") + 50 }))));
mustFail("a cut with no sound", "with no sound", input({}, withBeats((b) => void delete b[4]!.sfx)));
mustFail("a reveal with no sound", "has no sound", input({}, { reveals: [{ at: { frame: framesWord("Them.") - 20 } }] }));
mustFail("a sound in the silence before the drop", "breaks the silence", input({}, withBeats((b) => (b[5]!.at = { frame: framesWord("watching.") - 6 }))));
mustFail("a digit in a headline", "has a digit", input({}, withBeats((b) => (b[1] = { at: { cue: "It" }, scene: "HeadlineSlam", props: { lines: ["10,000 apps"], wordFrames: [0, 2] } }))));
mustFail("a real brand", "real brand", input({}, withBeats((b) => (b[1] = { at: { cue: "It" }, scene: "HeadlineSlam", props: { lines: ["Better than Notion"], wordFrames: [0, 2, 4] } }))));
mustFail("a name from the references", "real brand", input({}, withBeats((b) => (b[3] = { at: { cue: "Them#2" }, scene: "HudFrame", props: { labels: { topLeft: "Noiz" } }, sfx: "impact" }))));
mustFail("a headline too wide for the safe column", "doesn't fit", input({}, withBeats((b) => (b[1] = { at: { cue: "It" }, scene: "HeadlineSlam", props: { lines: ["Somewhere somebody shipped"], wordFrames: [0, 2, 4] } }))));
mustFail("a caption over a headline", "say the same thing", input({}, withBeats((b) => (b[1]!.caption = true))));
mustFail("a [beat] off by 60 ms", "(±40 ms)", input({ pauses: fakePauses.map((p, i) => (i === 0 ? { from: p.from, to: p.to + 0.06 } : p)) }));
mustFail("a pause the script doesn't mark", "doesn't mark", input({ pauses: [...fakePauses, { from: fakeWords[1]!.end, to: fakeWords[1]!.end + 0.5 }] }));
mustFail("a [beat] outside 0.3–1.0", "is outside", input({ narration: SCRIPT.replace("[beat 0.8]", "[beat 1.4]") }, {}, { script: SCRIPT.replace("[beat 0.8]", "[beat 1.4]") }));
mustFail("too few words", "words (40–60)", input({ words: fakeWords.slice(10) }, {}, { script: "Too short. Join the waitlist. Link in bio." }));
mustFail("no CTA at the end", "doesn't end with", input({ words: fakeWords.slice(0, -6) }));
mustFail("the wrong style line", "style line", input({ styleBlock: "STYLE: upbeat and quick" }));
mustFail("spec and narration out of sync", "differ", input({ narration: SCRIPT.replace("weekend", "month") }));
mustFail("music without a license proof", "no license proof", input({ musicLicensed: false }));
mustFail("a weak drop", "isn't clear", input({ music: { ...fakeMusic, drop: { ...fakeMusic.drop, source: "weak" } } }));
mustFail("a track shorter than the video", "ends before", input({ music: { ...fakeMusic, seconds: 15 } }));
mustFail("act 2 shorter than act 1's end", "too short", input({}, { act2Beats: 0 }));
mustFail("a sound missing from the manifest", 'no sound for the cue type', input({ sounds: { ...sounds, impact: undefined } }));
mustFail("a sound with no license", "no source or license", input({ sounds: { ...sounds, impact: { ...sounds.impact!, license: "" } } }));
mustFail("a missing sound file", "is missing", input({ sfxFiles: sfxFiles.filter((f) => f !== "impact.wav") }));

ok("facts are read from the database file", COUNTS.products > 0, `${COUNTS.products} products`);

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.error(`  ✖ ${f}`);
  process.exit(1);
}
