import type { BeatSpec, SceneName } from "../lib/types";

/** Scenes whose words are already on screen: no captions unless the spec asks for them. */
export const SHOWS_OWN_WORDS: SceneName[] = ["KineticText", "StatOrQuote", "LightSweep"];

/** Where a beat's captions go: the spec's choice, else none for scenes that show their words, else bottom. */
export function captionPosition(beat: BeatSpec): "top" | "bottom" | "none" {
  return beat.captions ?? (SHOWS_OWN_WORDS.includes(beat.scene) ? "none" : "bottom");
}
