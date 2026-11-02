import type { BeatSpec, SceneName, VideoSpec } from "../lib/types";

/** Scenes whose words are already on screen: no captions unless the spec asks for them. */
export const SHOWS_OWN_WORDS: SceneName[] = ["KineticText", "StatOrQuote", "LightSweep"];
/** Scenes where real UI fills the middle of the frame. */
export const UI_SCENES: SceneName[] = ["PhoneFrame", "CardCrop"];

/** The video's one caption band: the spec's choice, else top when any beat shows UI, else bottom. */
export function captionBand(spec: Pick<VideoSpec, "beats" | "style">): "top" | "bottom" {
  return spec.style.captions ?? (spec.beats.some((b) => UI_SCENES.includes(b.scene)) ? "top" : "bottom");
}

/** Whether a beat shows captions: the spec's choice, else not for scenes that show their own words. */
export function showsCaptions(beat: BeatSpec): boolean {
  return beat.captions ? beat.captions === "show" : !SHOWS_OWN_WORDS.includes(beat.scene);
}
