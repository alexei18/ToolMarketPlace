/*
 * The kit's components as data: their props by name and what each one sounds like. Pure TypeScript
 * with type-only imports, so the node scripts (video-check) read the same cues the compositions play.
 */
import type { ChromeMarkProps } from "./ChromeMark";
import { shiftCues, type Cue } from "./cues";
import { counterTicks, typeEvents } from "./lib";

export interface KitProps {
  ChromeMark: ChromeMarkProps;
}
export type KitScene = keyof KitProps;

/** A component placed somewhere, without its length (the timeline gives that). */
export type KitBeat = { [S in KitScene]: { scene: S; props: Omit<KitProps[S], "durationInFrames"> } }[KitScene];

/** Each component's sounds, in frames from its start. Transitions add the sounds of the shots they hold. */
export const KIT_CUES: { [S in KitScene]: (p: KitProps[S]) => Cue[] } = {
  ChromeMark: (p) => [{ frame: 0, type: "swell" }, ...(p.sweepAt !== undefined ? [{ frame: p.sweepAt, type: "shimmer" as const }] : [])],
};

/** Room tone under every shot. */
export const stageCues = (durationInFrames: number): Cue[] => [{ frame: 0, type: "roomtone", loopFrames: durationInFrames }];

export function kitCues(beat: KitBeat, durationInFrames: number): Cue[] {
  const fn = KIT_CUES[beat.scene] as (p: unknown) => Cue[];
  return fn({ ...beat.props, durationInFrames });
}
