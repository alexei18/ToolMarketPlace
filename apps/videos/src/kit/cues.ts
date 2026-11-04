/*
 * Sound cues. A component doesn't emit sounds while rendering (Remotion only mounts what's on the
 * current frame, in any order): next to each component a pure function returns its cues, frames
 * relative to the component's start. SoundLayer plays them; video-check reads the same list.
 */
export type CueType =
  | "roomtone"
  | "swell"
  | "impact"
  | "impactHeavy"
  | "shimmer"
  | "whooshSoft"
  | "whooshShort"
  | "swoosh"
  | "glitch"
  | "clickDry"
  | "clickUi"
  | "key"
  | "tick"
  | "riserShort"
  | "riser"
  | "pop"
  | "tone";

export interface Cue {
  frame: number;
  type: CueType;
  /** Extra gain in dB on top of the type's level. */
  gainDb?: number;
  /** A looped sound (room tone) for this many frames. */
  loopFrames?: number;
}

/** Moves a component's cues to where it starts on the timeline. */
export const shiftCues = (cues: Cue[], by: number): Cue[] => cues.map((c) => ({ ...c, frame: c.frame + by }));
