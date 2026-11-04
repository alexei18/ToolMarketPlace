/*
 * The StyleGallery's items, in order: every component for 4–6 s. Texts are from docs/COPY.md and the
 * bible's approved lines; numbers come from src/data/facts.json (the seeded demo database), marked
 * Illustrative. Timings here are made up for the preview: real videos take them from words.json and
 * the music's beats.
 */
import { CATEGORY_SEED } from "../../../../packages/shared/src/categories";
import { shiftCues, type Cue } from "./cues";
import { kitCues, stageCues, type KitBeat } from "./scenes";

export type GalleryItem = KitBeat & { name: string; frames: number; stage?: { drift?: boolean } };

const on3d = { drift: false };

export const GALLERY: GalleryItem[] = [
  { name: "Stage", frames: 120, scene: "Stage", props: {} },
  { name: "ChromeMark macro glide", frames: 120, stage: on3d, scene: "ChromeMark", props: { camera: "macroGlide" } },
  { name: "ChromeMark slow orbit", frames: 120, stage: on3d, scene: "ChromeMark", props: { camera: "slowOrbit", sweepAt: 50 } },
  { name: "ChromeMark push-in", frames: 120, stage: on3d, scene: "ChromeMark", props: { camera: "pushIn" } },
  { name: "ChromeMark reveal spin", frames: 120, stage: on3d, scene: "ChromeMark", props: { camera: "revealSpin" } },
  { name: "ChromeWordmark", frames: 150, stage: on3d, scene: "ChromeWordmark", props: { sweepAt: 14, cta: "Join the waitlist", sub: "Link in bio", textAt: 30 } },
  { name: "LightSweep", frames: 120, scene: "LightSweep", props: { at: 44, over: { scene: "FloatCard", props: { capture: "kit-feed", target: "row1" } } } },
  {
    name: "FocusPull",
    frames: 150,
    scene: "FocusPull",
    props: {
      at: 66,
      a: { scene: "FloatCard", props: { capture: "kit-feed", target: "row1" } },
      b: { scene: "HeadlineSlam", props: { lines: ["Nobody", "can pay", "to rank."], wordFrames: [8, 12, 16, 20, 24] } },
    },
  },
  {
    name: "MatchCut",
    frames: 150,
    stage: on3d,
    scene: "MatchCut",
    props: {
      rows: ["Free forever", "Verified makers", "Nobody can pay to rank"],
      matchRow: 0,
      at: 60,
      to: { x: 259, y: 787, w: 275, h: 381 },
      b: { scene: "ChromeMark", props: { camera: "pushIn", sweepAt: 40 } },
    },
  },
  { name: "WireframeCollapse", frames: 150, scene: "WireframeCollapse", props: { capture: "kit-feed", boxes: "skeleton", breakAt: 24, collapseAt: 100 } },
  { name: "HeadlineSlam", frames: 120, scene: "HeadlineSlam", props: { lines: ["We're not", "letting", "you in."], wordFrames: [6, 16, 28, 40, 50], accent: "in" } },
  {
    name: "TypeBackspace",
    frames: 150,
    scene: "TypeBackspace",
    props: {
      field: true,
      steps: [
        { at: 6, text: "best new app for notes" },
        { at: 76, text: "new apps worth trying" },
      ],
    },
  },
  {
    name: "HudFrame",
    frames: 120,
    scene: "HudFrame",
    props: {
      labels: { topLeft: "Top this week", bottomLeft: "Illustrative", bottomRight: "Tryworthy" },
      timecode: true,
      over: { scene: "HeadlineSlam", props: { lines: ["Every day,", "new apps", "launch."], wordFrames: [10, 20, 28, 36, 46], layout: "editorial" } },
    },
  },
  { name: "FloatCard", frames: 120, scene: "FloatCard", props: { capture: "kit-feed", target: "row1" } },
];

export const GALLERY_TOTAL = GALLERY.reduce((n, i) => n + i.frames, 0);

/** Every item's sound, on the gallery's timeline. */
export function galleryCues(): Cue[] {
  let from = 0;
  return GALLERY.flatMap((item) => {
    const cues = shiftCues([...stageCues(item.frames), ...kitCues(item, item.frames)], from);
    from += item.frames;
    return cues;
  });
}
