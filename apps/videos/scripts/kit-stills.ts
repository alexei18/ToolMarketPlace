/*
 * npm run video:kit-stills <item[@frame]|all> … [--gl=angle]
 * Stills of StyleGallery items to out/kit/<item>-<frame>.png, with the time per frame. For looking
 * at a component while building it. Without @frame: the first, middle and last frames.
 */
import path from "node:path";
import { renderStill, selectComposition } from "@remotion/renderer";
import { GALLERY } from "../src/kit/gallery-list";
import { ensureDir, fail, ROOT } from "./lib/common";
import { bundleProject } from "./render";

const args = process.argv.slice(2);
const gl = (args.find((a) => a.startsWith("--gl="))?.slice(5) ?? "angle") as "angle" | "swiftshader" | "egl" | "swangle" | "vulkan" | "angle-egl";
const asked = args.filter((a) => !a.startsWith("--"));
if (asked.length === 0) fail("Usage: npm run video:kit-stills <item[@frame]|all> … [--gl=angle]");

const serveUrl = await bundleProject();
const composition = await selectComposition({ serveUrl, id: "StyleGallery", chromiumOptions: { gl }, inputProps: {} });
const dir = path.join(ROOT, "out", "kit");
ensureDir(dir);
const starts = new Map<string, number>();
let from = 0;
for (const item of GALLERY) {
  starts.set(item.name, from);
  from += item.frames;
}
for (const request of asked) {
  const [name, frame] = request.split("@") as [string, string | undefined];
  for (const item of GALLERY) {
    if (name !== "all" && !item.name.toLowerCase().startsWith(name.toLowerCase())) continue;
    for (const f of frame !== undefined ? [Number(frame)] : [0, Math.floor(item.frames / 2), item.frames - 1]) {
      const output = path.join(dir, `${item.name.replace(/\s+/g, "-")}-${f}.png`);
      const t0 = Date.now();
      await renderStill({
        composition,
        serveUrl,
        output,
        frame: starts.get(item.name)! + f,
        imageFormat: "png",
        chromiumOptions: { gl },
        timeoutInMilliseconds: 240000,
        onBrowserLog: (l) => {
          if (l.type === "error") console.log(`  [browser] ${l.text.slice(0, 300)}`);
        },
      });
      console.log(`  ${item.name} @${f}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    }
  }
}
