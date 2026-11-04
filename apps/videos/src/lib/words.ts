/* Word handling shared by the scripts (alignment, checks) and the compositions. No dependencies. */

/** Lowercase, curly quotes straightened, everything but letters, digits and apostrophes dropped. */
export function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9']/g, "")
    .replace(/^'+|'+$/g, "");
}

const BEAT_MARK = /\[beat\s+([\d.]+)\]/g;

/** The pauses a script asks for: `[beat 0.6]`, after which word (index into scriptWords). */
export function scriptBeats(script: string): { afterWord: number; seconds: number }[] {
  const out: { afterWord: number; seconds: number }[] = [];
  for (const m of script.matchAll(BEAT_MARK)) out.push({ afterWord: scriptWords(script.slice(0, m.index)).length - 1, seconds: Number(m[1]) });
  return out;
}

/** The script's words as written (with punctuation), skipping tokens that hold no letters or digits, and [beat] marks. */
export function scriptWords(script: string): string[] {
  return script
    .replace(BEAT_MARK, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => normalizeWord(w) !== "");
}

/** A caption or on-screen form of a word: trailing commas and periods dropped, ? and ! kept. */
export function displayWord(word: string): string {
  return word.replace(/[.,;:]+$/, "");
}

/** "save" → { word: "save", occurrence: 1 }; "save#2" → occurrence 2. */
export function parseCue(cue: string): { word: string; occurrence: number } {
  const [w, n] = cue.split("#");
  return { word: normalizeWord(w ?? ""), occurrence: n ? Number(n) : 1 };
}

/** Index in `words` of the cue's word, or -1. */
export function findCue(words: { word: string }[], cue: string): number {
  const { word, occurrence } = parseCue(cue);
  let seen = 0;
  for (let i = 0; i < words.length; i++) {
    if (normalizeWord(words[i]!.word) === word && ++seen === occurrence) return i;
  }
  return -1;
}
