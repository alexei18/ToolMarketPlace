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
  { name: "ChromeMark macro glide", frames: 120, stage: on3d, scene: "ChromeMark", props: { camera: "macroGlide" } },
  { name: "ChromeMark slow orbit", frames: 120, stage: on3d, scene: "ChromeMark", props: { camera: "slowOrbit", sweepAt: 50 } },
  { name: "ChromeMark push-in", frames: 120, stage: on3d, scene: "ChromeMark", props: { camera: "pushIn" } },
  { name: "ChromeMark reveal spin", frames: 120, stage: on3d, scene: "ChromeMark", props: { camera: "revealSpin" } },
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
