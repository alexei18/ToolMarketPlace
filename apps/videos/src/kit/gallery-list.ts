/*
 * The StyleGallery's items, in order. Texts are from docs/COPY.md and the bible's approved lines;
 * demo numbers come from src/data/facts.json (the seeded demo database), marked Illustrative.
 */
import type { KitBeat } from "./scenes";

export type GalleryItem = KitBeat & { name: string; frames: number; stage?: { drift?: boolean } };

export const GALLERY: GalleryItem[] = [
  { name: "ChromeMark macroGlide", frames: 150, stage: { drift: false }, scene: "ChromeMark", props: { camera: "macroGlide" } },
  { name: "ChromeMark slowOrbit", frames: 150, stage: { drift: false }, scene: "ChromeMark", props: { camera: "slowOrbit", sweepAt: 60 } },
  { name: "ChromeMark pushIn", frames: 150, stage: { drift: false }, scene: "ChromeMark", props: { camera: "pushIn" } },
  { name: "ChromeMark revealSpin", frames: 150, stage: { drift: false }, scene: "ChromeMark", props: { camera: "revealSpin" } },
];

export const GALLERY_TOTAL = GALLERY.reduce((n, i) => n + i.frames, 0);
