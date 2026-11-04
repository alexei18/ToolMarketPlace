/*
 * npm run video:kit-stills <item> [frame…] [--gl=angle]
 * Stills of one StyleGallery item to out/kit/<item>-<frame>.png, with the time per frame. For
 * looking at a component while building it; `all` takes every item.
 */
import path from "node:path";
import { renderStill, selectComposition } from "@remotion/renderer";
import { GALLERY } from "../src/kit/gallery-list";
import { ensureDir, fail, ROOT } from "./lib/common";
import { bundleProject } from "./render";

const args = process.argv.slice(2);
const gl = (args.find((a) => a.startsWith("--gl="))?.slice(5) ?? "angle") as "angle" | "swiftshader" | "egl" | "swangle" | "vulkan" | "angle-egl";
const positional = args.filter((a) => !a.startsWith("--"));
const name = positional[0];
if (!name) fail("Usage: npm run video:kit-stills <item|all> [frame…] [--gl=angle]");
const frames = positional.slice(1).map(Number);

const serveUrl = await bundleProject();
const composition = await selectComposition({ serveUrl, id: "StyleGallery", chromiumOptions: { gl } });
const dir = path.join(ROOT, "out", "kit");
ensureDir(dir);
let from = 0;
for (const item of GALLERY) {
  const at = from;
  from += item.frames;
  if (name !== "all" && !item.name.toLowerCase().startsWith(name.toLowerCase())) continue;
  for (const f of frames.length ? frames : [0, Math.floor(item.frames / 2), item.frames - 1]) {
    const output = path.join(dir, `${item.name.replace(/\s+/g, "-")}-${f}.png`);
    const t0 = Date.now();
    await renderStill({
      composition,
      serveUrl,
      output,
      frame: at + f,
      imageFormat: "png",
      chromiumOptions: { gl },
      timeoutInMilliseconds: 240000,
      onBrowserLog: (l) => {
        if (l.type === "error") console.log(`  [browser] ${l.text.slice(0, 300)}`);
      },
    });
    console.log(`  ${item.name} @${f}: ${((Date.now() - t0) / 1000).toFixed(1)} s → ${path.relative(process.cwd(), output)}`);
  }
}
