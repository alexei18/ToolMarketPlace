/*
 * The kit's components as data: their props by name and what each one sounds like. Pure TypeScript
 * with type-only imports, so the node scripts (video-check) read the same cues the compositions play.
 */
import type { ChromeMarkProps } from "./ChromeMark";
import type { ChromeWordmarkProps } from "./ChromeWordmark";
import { shiftCues, type Cue } from "./cues";
import type { FloatCardProps } from "./FloatCard";
import type { FocusPullProps } from "./FocusPull";
import type { HeadlineSlamProps } from "./HeadlineSlam";
import { counterTicks, typeEvents } from "./lib";
import type { LightSweepProps } from "./LightSweep";
import type { MatchCutProps } from "./MatchCut";
import type { StageShotProps } from "./StageShot";
import type { WireframeCollapseProps } from "./WireframeCollapse";

export interface KitProps {
  ChromeMark: ChromeMarkProps;
  ChromeWordmark: ChromeWordmarkProps;
  FloatCard: FloatCardProps;
  FocusPull: FocusPullProps;
  HeadlineSlam: HeadlineSlamProps;
  LightSweep: LightSweepProps;
  MatchCut: MatchCutProps;
  Stage: StageShotProps;
  WireframeCollapse: WireframeCollapseProps;
}
export type KitScene = keyof KitProps;

/** A component placed somewhere, without its length (the timeline gives that). */
export type KitBeat = { [S in KitScene]: { scene: S; props: Omit<KitProps[S], "durationInFrames"> } }[KitScene];

/** Each component's sounds, in frames from its start. Transitions add the sounds of the shots they hold. */
export const KIT_CUES: { [S in KitScene]: (p: KitProps[S]) => Cue[] } = {
  ChromeMark: (p) => [{ frame: 0, type: "swell" }, ...(p.sweepAt !== undefined ? [{ frame: p.sweepAt, type: "shimmer" as const }] : [])],
  ChromeWordmark: (p) => [
    { frame: 0, type: "impact" },
    { frame: p.sweepAt ?? 12, type: "shimmer" },
  ],
  FloatCard: () => [{ frame: 0, type: "swoosh" }],
  FocusPull: (p) => [...kitCues(p.a, p.at + (p.frames ?? 16)), { frame: p.at, type: "whooshSoft" }, ...shiftCues(kitCues(p.b, p.durationInFrames - p.at), p.at)],
  HeadlineSlam: (p) => p.wordFrames.map((frame) => ({ frame, type: "clickDry" as const })),
  LightSweep: (p) => [...kitCues(p.over, p.durationInFrames), { frame: p.at, type: "shimmer" }],
  MatchCut: (p) => [{ frame: p.at - 14, type: "whooshShort" }, { frame: p.at, type: "impact" }, ...shiftCues(kitCues(p.b, p.durationInFrames - p.at), p.at)],
  Stage: () => [],
  WireframeCollapse: (p) => [
    { frame: p.breakAt, type: "glitch" },
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ frame: p.breakAt + 6 + i * 7, type: "clickDry" as const })),
    { frame: p.collapseAt, type: "whooshShort" },
    { frame: p.collapseAt + 16, type: "clickUi" },
  ],
};

/** Room tone under every shot. */
export const stageCues = (durationInFrames: number): Cue[] => [{ frame: 0, type: "roomtone", loopFrames: durationInFrames }];

export function kitCues(beat: KitBeat, durationInFrames: number): Cue[] {
  const fn = KIT_CUES[beat.scene] as (p: unknown) => Cue[];
  return fn({ ...beat.props, durationInFrames });
}
