/* Word handling shared by the scripts (alignment, checks) and the compositions. No dependencies. */

/** Lowercase, curly quotes straightened, everything but letters, digits and apostrophes dropped. */
export function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9']/g, "")
    .replace(/^'+|'+$/g, "");
}

/** The script's words as written (with punctuation), skipping tokens that hold no letters or digits. */
export function scriptWords(script: string): string[] {
  return script
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
