/*
 * The SceneGallery's slots, in order: each scene's name and the key frames (inside its slot) that
 * scripts/contact-sheet.ts renders. Gallery.tsx draws the scenes in the same order.
 */
export const SLOT = 75;

export const GALLERY_SCENES: { name: string; keys: number[] }[] = [
  { name: "KineticText slam", keys: [8, 26, 60] },
  { name: "KineticText typewriter", keys: [20, 60] },
  { name: "KineticText highlight", keys: [10, 60] },
  { name: "CardReveal", keys: [10, 22, 60] },
  { name: "LightSweep", keys: [12, 36, 70] },
  { name: "CheckDraw", keys: [10, 19, 60] },
  { name: "StatOrQuote", keys: [12, 32, 70] },
  { name: "CardCrop", keys: [10, 50, 70] },
  { name: "Endscreen light", keys: [6, 20, 59] },
  { name: "Endscreen dark", keys: [59] },
];

export const GALLERY_FRAMES = SLOT * GALLERY_SCENES.length;
