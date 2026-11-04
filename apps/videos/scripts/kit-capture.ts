/*
 * npm run video:kit-capture
 * Captures the pages the StyleGallery shows (src/kit/captures.json), from the video-capture stack
 * like every other capture.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import type { CaptureRecipe } from "../src/lib/types";
import { assertSeededSite, VIDEO_STACK } from "../seed/stack";
import { captureOne } from "./capture";
import { fail, ROOT } from "./lib/common";

const recipes = JSON.parse(readFileSync(path.join(ROOT, "src", "kit", "captures.json"), "utf8")) as Record<string, CaptureRecipe>;
await assertSeededSite(VIDEO_STACK.web).catch((e: Error) => fail(e.message));
const browser = await chromium.launch();
try {
  for (const [name, recipe] of Object.entries(recipes)) await captureOne(browser, name, recipe);
} finally {
  await browser.close();
}
