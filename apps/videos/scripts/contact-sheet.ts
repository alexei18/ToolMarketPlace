/*
 * npm run video:sheet [scene names…]
 * A contact sheet of the SceneGallery: each scene at its key frames (src/lib/gallery.ts), with the
 * layout overlay on (zones, center line, caption bands), one row per scene, to
 * out/checks/scene-gallery.png. Without names it covers every gallery scene.
 */
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { renderStill, selectComposition } from "@remotion/renderer";
import { GALLERY_SCENES, SLOT } from "../src/lib/gallery";
import { ensureDir, FFMPEG, paths, run } from "./lib/common";
import { bundleProject } from "./render";

const wanted = process.argv.slice(2);
const items = GALLERY_SCENES.map((it, i) => ({ ...it, i })).filter((it) => wanted.length === 0 || wanted.some((w) => it.name.toLowerCase().startsWith(w.toLowerCase())));
if (items.length === 0) throw new Error(`No gallery scene matches ${wanted.join(", ")}`);

const serveUrl = await bundleProject();
const inputProps = { debugSafeZone: true };
const composition = await selectComposition({ serveUrl, id: "SceneGallery", inputProps });
const dir = path.join(paths.checks, "sheet");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const COLS = Math.max(...items.map((it) => it.keys.length));
let n = 0;
for (const it of items) {
  for (let c = 0; c < COLS; c++) {
    const key = it.keys[c];
    const out = path.join(dir, `${String(n++).padStart(3, "0")}.png`);
    if (key === undefined) {
      // Pad short rows with a blank cell.
      await run(FFMPEG, ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=white:s=1080x1920", "-frames:v", "1", out]);
      continue;
    }
    await renderStill({ composition, serveUrl, output: out, frame: it.i * SLOT + key, inputProps, imageFormat: "png" });
  }
  console.log(`  ${it.name}: frames ${it.keys.join(", ")}`);
}

ensureDir(paths.checks);
const sheet = path.join(paths.checks, "scene-gallery.png");
await run(FFMPEG, ["-v", "error", "-y", "-framerate", "1", "-i", path.join(dir, "%03d.png"), "-vf", `scale=360:640,tile=${COLS}x${items.length}:padding=16:margin=16:color=white`, "-frames:v", "1", sheet]);
console.log(`✔ contact sheet (${items.length} scenes × ${COLS}) → ${path.relative(process.cwd(), sheet)}`);
