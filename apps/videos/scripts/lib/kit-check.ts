/*
 * The automatic checks of the bible's quality section, for motion-kit videos. Pure: everything comes
 * in as data, so the self-test can feed it broken videos. Two stages, because some of it can only be
 * measured on the finished file: checkKit before the render (it blocks the render), and the checks in
 * measureRender (loudness, end silence, static frames) after it (they block the file from being final).
 *
 * The number and brand checks read the spec's text, not the pixels: captures are checked for digits
 * when captured, and a brand name that isn't on the list below won't be caught.
 */
import type { CueType } from "../../src/kit/cues";
import { kitCues } from "../../src/kit/scenes";
import { KIT } from "../../src/kit/tokens-data";
import { buildKitTimeline, RISER_FRAMES, SILENCE_FRAMES, type KitTimeline, type MusicAnalysis } from "../../src/lib/kit-timeline";
import { textWidth } from "../../src/lib/textwidth";
import { contrast, over } from "../../src/lib/theme";
import type { VideoSpec, Word } from "../../src/lib/types";
import { normalizeWord, scriptBeats, scriptWords } from "../../src/lib/words";

export const KIT_LIMITS = {
  words: [40, 60] as const,
  /** Words per second of act 1, pauses included (warning outside). */
  pace: [2.3, 3.0] as const,
  beat: [0.3, 1.0] as const,
  beatTolerance: 0.04,
  /** Any pause that isn't a marked [beat]. */
  maxPause: 0.35,
  maxFirstWord: 0.3,
  /** A cut may be this far from its word, [beat] or music beat. */
  cutFrames: 2,
  dropFrames: 1,
  sfxFrames: 1,
  /** Video length (warning outside). */
  seconds: [28, 35] as const,
  minContrast: 4.5,
  headlineMin: 120,
  safeWidth: 804,
};

/** The exact line for Google AI Studio (docs/video-motion-bible.md). */
export const AI_STUDIO_STYLE = "Read this like a calm, confident narrator in a short film trailer: low, close to the microphone, unhurried, slight tension, never salesy. Pause only where the script says [beat].";

/**
 * Real names that must never appear: common launch sites and big apps, and everything from the
 * reference videos, which are for study only.
 */
export const DENIED_NAMES = [
  "Noiz",
  "get here first",
  "Product Hunt",
  "ProductHunt",
  "Hacker News",
  "Reddit",
  "BetaList",
  "AppSumo",
  "Indie Hackers",
  "G2",
  "Capterra",
  "Notion",
  "Evernote",
  "Obsidian",
  "ChatGPT",
  "OpenAI",
  "Claude",
  "Anthropic",
  "Gemini",
  "Google",
  "Apple",
  "Microsoft",
  "Meta",
  "Figma",
  "Canva",
  "Slack",
  "Discord",
  "Twitter",
  "Instagram",
  "YouTube",
  "Spotify",
  "Netflix",
];

/** Props that name things in the code, not text on screen. */
const NOT_TEXT = new Set(["capture", "target", "boxes", "scene", "fact", "series", "layout", "kind", "camera", "state", "$cue", "$words"]);

export interface KitInputs {
  spec: VideoSpec;
  /** The words of the cleaned voice. */
  words: Word[];
  music: MusicAnalysis;
  /** Is there a license proof next to the track? */
  musicLicensed: boolean;
  /** Silences measured in the cleaned voice. */
  pauses: { from: number; to: number }[];
  /** vo/<ID>.txt: the style line and the narration, as written. */
  styleBlock: string;
  narration: string;
  /** public/sfx/manifest.json */
  sounds: Record<string, { files: string[]; license: string; source: string } | undefined>;
  /** Files present in public/sfx. */
  sfxFiles: string[];
  fps: number;
}

export interface KitResult {
  failures: string[];
  warnings: string[];
  tl: KitTimeline | null;
}

/** Every piece of on-screen text inside a beat's props. */
function textsOf(value: unknown, key = ""): string[] {
  if (NOT_TEXT.has(key)) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((v) => textsOf(v, key));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => textsOf(v, k));
  return [];
}

const nearest = (t: number, list: number[]) => list.reduce((best, v) => (Math.abs(v - t) < Math.abs(best - t) ? v : best), list[0] ?? Infinity);

export function checkKit(input: KitInputs): KitResult {
  const { spec, words, music, fps } = input;
  const failures: string[] = [];
  const warnings: string[] = [];
  const kit = spec.kit!;
  const frame = (s: number) => Math.round(s * fps);

  // The script.
  const written = scriptWords(spec.script);
  if (written.length < KIT_LIMITS.words[0] || written.length > KIT_LIMITS.words[1]) failures.push(`the script has ${written.length} words (${KIT_LIMITS.words[0]}–${KIT_LIMITS.words[1]})`);
  if (written.map(normalizeWord).join(" ") !== words.map((w) => normalizeWord(w.word)).join(" ")) failures.push("words.json doesn't match the script; run vo-align again");
  const beats = scriptBeats(spec.script);
  for (const b of beats) if (b.seconds < KIT_LIMITS.beat[0] || b.seconds > KIT_LIMITS.beat[1]) failures.push(`[beat ${b.seconds}] after "${written[b.afterWord]}" is outside ${KIT_LIMITS.beat[0]}–${KIT_LIMITS.beat[1]} s`);
  if (input.narration.replace(/\s+/g, " ").trim() !== spec.script.replace(/\s+/g, " ").trim()) failures.push(`vo/${spec.id}.txt and the spec's script differ (words or [beat] marks)`);
  if (!input.styleBlock.includes(AI_STUDIO_STYLE)) failures.push(`vo/${spec.id}.txt doesn't carry the bible's style line for AI Studio`);

  // Timeline errors are failures too, not crashes.
  let tl: KitTimeline | null = null;
  try {
    tl = buildKitTimeline(spec.id, kit, words, music, fps);
  } catch (e) {
    failures.push((e as Error).message);
  }

  // Pauses, measured in the audio.
  const firstWord = words[0];
  if (firstWord && firstWord.start > KIT_LIMITS.maxFirstWord) failures.push(`first word starts at ${firstWord.start.toFixed(2)} s (max ${KIT_LIMITS.maxFirstWord} s)`);
  const marked = new Map<{ from: number; to: number }, number>();
  for (const b of beats) {
    const before = words[b.afterWord];
    const after = words[b.afterWord + 1];
    if (!before || !after) continue;
    const gap = input.pauses.filter((p) => p.from < after.start + 0.06 && p.to > before.end - 0.06).sort((x, y) => y.to - y.from - (x.to - x.from))[0];
    if (!gap) {
      failures.push(`[beat ${b.seconds}] after "${before.word}": no pause in the audio`);
      continue;
    }
    marked.set(gap, b.seconds);
    const got = gap.to - gap.from;
    if (Math.abs(got - b.seconds) > KIT_LIMITS.beatTolerance) failures.push(`[beat ${b.seconds}] after "${before.word}" is ${got.toFixed(3)} s in the audio (±${KIT_LIMITS.beatTolerance * 1000} ms)`);
  }
  for (const p of input.pauses) {
    const seconds = p.to - p.from;
    if (!marked.has(p) && seconds > KIT_LIMITS.maxPause) failures.push(`pause of ${seconds.toFixed(2)} s at ${p.from.toFixed(2)} s that the script doesn't mark (max ${KIT_LIMITS.maxPause} s)`);
  }

  // Music.
  if (!input.musicLicensed) failures.push(`${kit.music}: no license proof next to the track`);
  if (music.drop.source === "weak") failures.push(`${kit.music}: the drop isn't clear (+${music.drop.jumpDb} dB); listen and write its .drop.json`);

  if (tl) {
    const secs = tl.durationInFrames / fps;
    if (secs < KIT_LIMITS.seconds[0] || secs > KIT_LIMITS.seconds[1]) warnings.push(`the video is ${secs.toFixed(1)} s (${KIT_LIMITS.seconds[0]}–${KIT_LIMITS.seconds[1]})`);
    const act1 = tl.words[tl.ctaIndex - 1]!.end;
    const pace = tl.ctaIndex / act1;
    if (pace < KIT_LIMITS.pace[0] || pace > KIT_LIMITS.pace[1]) warnings.push(`act 1 runs at ${pace.toFixed(2)} words/s (${KIT_LIMITS.pace[0]}–${KIT_LIMITS.pace[1]}); the tempo is not changed, so consider re-recording`);
    if (tl.dropFrame + (music.seconds - music.drop.at) * fps < tl.durationInFrames) failures.push(`${kit.music} ends before the video does`);

    // The drop lands on the twist word, in the plan: the rounding to whole frames can't move it far. The
    // render check then measures where it really landed in the file.
    const dropOnScreen = tl.music.from + (music.drop.at * fps - tl.music.trimBefore);
    const twistAt = words[tl.twistIndex]!.start * fps;
    const dropOff = Math.abs(dropOnScreen - twistAt);
    if (dropOff > KIT_LIMITS.dropFrames) failures.push(`the drop lands ${dropOff.toFixed(1)} frames from "${words[tl.twistIndex]!.word}" (max ${KIT_LIMITS.dropFrames})`);

    // Cuts: on a word or a [beat] in act 1, on a music beat after the drop.
    const anchors = [...words.slice(0, tl.ctaIndex).map((w) => frame(w.start)), ...[...marked.keys()].flatMap((p) => [frame(p.from), frame(p.to)])];
    for (const b of tl.beats.slice(1)) {
      const list = b.from < tl.dropFrame ? anchors : tl.beatFrames;
      const off = Math.abs(nearest(b.from, list) - b.from);
      if (off > KIT_LIMITS.cutFrames) failures.push(`beat ${b.index + 1} (${b.beat.scene}) cuts at frame ${b.from}, ${off} frames from the nearest ${b.from < tl.dropFrame ? "word or [beat]" : "music beat"} (max ${KIT_LIMITS.cutFrames})`);
    }

    // Sound on every cut, reveal and [beat].
    const sounding = tl.cues.filter((c) => c.type !== "roomtone");
    const hasCue = (f: number, reach = KIT_LIMITS.sfxFrames) => sounding.some((c) => Math.abs(c.frame - f) <= reach);
    for (const b of tl.beats.slice(1)) if (!hasCue(b.from)) failures.push(`beat ${b.index + 1} (${b.beat.scene}) cuts at frame ${b.from} with no sound`);
    for (const r of tl.reveals) if (!hasCue(r)) failures.push(`the reveal at frame ${r} has no sound`);
    for (const [p, seconds] of marked) {
      const inPause = sounding.some((c) => c.frame >= frame(p.from) - KIT_LIMITS.cutFrames && c.frame <= frame(p.to) + KIT_LIMITS.cutFrames);
      if (!inPause) failures.push(`the [beat ${seconds}] at ${p.from.toFixed(2)} s has no reveal with a sound`);
    }

    // Near silence before the drop, the riser ending before it.
    const silenceFrom = tl.dropFrame - SILENCE_FRAMES;
    for (const c of sounding) if (c.frame >= silenceFrom && c.frame < tl.dropFrame) failures.push(`a ${c.type} at frame ${c.frame} breaks the silence before the drop`);
    const riser = sounding.find((c) => c.type === "riser");
    if (!riser) failures.push("no riser before the drop");
    else if (riser.frame + RISER_FRAMES > silenceFrom + 1 && riser.frame > 0) failures.push("the riser runs into the silence before the drop");

    // Every sound exists, with a source and a license.
    for (const type of new Set(tl.cues.map((c) => c.type))) {
      const s = input.sounds[type as CueType];
      if (!s) failures.push(`no sound for the cue type "${type}" in public/sfx/manifest.json`);
      else {
        if (!s.license || !s.source) failures.push(`${type}: no source or license in the manifest`);
        for (const f of s.files) if (!input.sfxFiles.includes(f)) failures.push(`${type}: public/sfx/${f} is missing`);
      }
    }

    // Beats that show their own words must not repeat them in a caption, and every word needs its frame.
    for (const b of tl.beats) {
      if (b.beat.scene !== "HeadlineSlam") continue;
      if (b.spec.caption) failures.push(`beat ${b.index + 1}: a HeadlineSlam and a caption would say the same thing in the same frame`);
      const count = b.beat.props.lines.flatMap((l) => l.split(/\s+/)).length;
      if (b.beat.props.wordFrames.length !== count) failures.push(`beat ${b.index + 1}: HeadlineSlam has ${count} words and ${b.beat.props.wordFrames.length} word frames`);
    }
    for (const b of tl.beats) {
      if (kitCues(b.beat, b.durationInFrames).some((c) => c.frame > b.durationInFrames)) warnings.push(`beat ${b.index + 1} (${b.beat.scene}) has a sound after its end`);
    }
  }

  // Numbers and names in anything the viewer reads or hears.
  const texts = [...written, ...kit.beats.flatMap((b) => textsOf(b.props))];
  const digits = [...new Set(texts.filter((t) => /\d/.test(t)))];
  for (const t of digits) failures.push(`"${t}" has a digit: numbers on screen come from the database (CounterRoll, ChartDraw), never from a spec`);
  const allText = texts.join(" ");
  for (const name of DENIED_NAMES) if (new RegExp(`\\b${name}\\b`, "i").test(allText)) failures.push(`"${name}" is a real brand or comes from the reference videos`);

  // Text fits the safe column at the smallest headline size, and reads on black.
  for (const b of kit.beats) {
    if (b.scene !== "HeadlineSlam") continue;
    for (const line of b.props.lines) if (textWidth(line, KIT_LIMITS.headlineMin, -0.04) > KIT_LIMITS.safeWidth) failures.push(`"${line}" doesn't fit the safe column at ${KIT_LIMITS.headlineMin} px; break the line`);
  }
  for (const [name, color] of [["text", KIT.text], ["accent", KIT.accent]] as const) {
    const c = contrast(over(color, KIT.bg), KIT.bg);
    if (c < KIT_LIMITS.minContrast) failures.push(`${name} has ${c.toFixed(2)}:1 contrast on the stage (min ${KIT_LIMITS.minContrast})`);
  }
  // The bible sets white at 45% for secondary text, which is just under: only worth a note, it's never the message.
  const secondary = contrast(over(KIT.secondary, KIT.bg), KIT.bg);
  if (secondary < KIT_LIMITS.minContrast) warnings.push(`secondary text has ${secondary.toFixed(2)}:1 contrast on the stage (the bible's white at 45%)`);

  return { failures, warnings, tl };
}

/**
 * The file's own measurements against the bible's numbers. `static` lists stretches of unchanged
 * frames (measured on a render without grain), which are fine only inside a marked [beat].
 */
export function checkRender(m: { lufs: number; truePeak: number; endSilence: number; dropOffFrames: number; statics: { from: number; to: number }[] }, pauses: { from: number; to: number }[], fps: number, limits = { lufs: -14, lufsTolerance: 1, truePeak: -1, endSilence: 0.3, staticSeconds: 0.5, dropFrames: 1 }): string[] {
  const failures: string[] = [];
  if (Math.abs(m.lufs - limits.lufs) > limits.lufsTolerance) failures.push(`the mix is ${m.lufs} LUFS (${limits.lufs} ±${limits.lufsTolerance})`);
  if (m.truePeak >= limits.truePeak) failures.push(`true peak ${m.truePeak} dBTP (must be under ${limits.truePeak})`);
  if (m.endSilence >= limits.endSilence) failures.push(`${m.endSilence.toFixed(2)} s of silence at the end (under ${limits.endSilence} s)`);
  if (m.dropOffFrames > limits.dropFrames) failures.push(`in the file, the drop is ${m.dropOffFrames.toFixed(1)} frames from the twist word (max ${limits.dropFrames})`);
  for (const s of m.statics) {
    const seconds = (s.to - s.from) / fps;
    if (seconds <= limits.staticSeconds) continue;
    const inBeat = pauses.some((p) => s.from / fps >= p.from - 0.1 && s.to / fps <= p.to + 0.1);
    if (!inBeat) failures.push(`frames ${s.from}–${s.to} are static for ${seconds.toFixed(2)} s (max ${limits.staticSeconds} s)`);
  }
  return failures;
}
