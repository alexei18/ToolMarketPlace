/*
 * npm run video:capture <ID>
 * Captures the real pages a video shows, from the running site (VIDEO_WEB_URL, default
 * http://localhost:4321) with Playwright, per the spec's "captures" recipes:
 * public/captures/<name>.png (+ <name>-<state>.png) and <name>.json with the page size and the
 * boxes of named elements, so scenes place the cursor and highlights on the real elements.
 * The page markup is the app's own; the capture only removes product rows outside the demo list
 * and can hide counts.
 */
import path from "node:path";
import { chromium } from "playwright";
import type { CaptureMeta } from "../src/captures";
import type { CaptureRecipe } from "../src/lib/types";
import { ensureDir, fail, idArg, loadSpec, paths, writeJson } from "./lib/common";

const WEB = (process.env.VIDEO_WEB_URL ?? "http://localhost:4321").replace(/\/$/, "");

export async function capturePages(id: string): Promise<CaptureMeta[]> {
  const spec = loadSpec(id);
  const recipes = Object.entries(spec.captures ?? {});
  if (recipes.length === 0) {
    console.log(`${id}: no captures in the spec`);
    return [];
  }
  ensureDir(paths.captures);
  const browser = await chromium.launch();
  const metas: CaptureMeta[] = [];
  try {
    for (const [name, r] of recipes) metas.push(await captureOne(browser, name, r));
  } finally {
    await browser.close();
  }
  return metas;
}

async function captureOne(browser: Awaited<ReturnType<typeof chromium.launch>>, name: string, r: CaptureRecipe): Promise<CaptureMeta> {
  const scale = r.scale ?? 2;
  const page = await browser.newPage({ viewport: { width: r.width, height: r.height }, deviceScaleFactor: scale });
  const res = await page.goto(WEB + r.route, { waitUntil: "networkidle" });
  if (!res || !res.ok()) fail(`${WEB}${r.route} answered ${res?.status()}`);
  const landed = new URL(page.url()).pathname;
  if (landed !== r.route.split("?")[0]) {
    fail(`${r.route} redirected to ${landed}. Is the site in waitlist mode? For captures, mark the local database launched:\n  UPDATE site_state SET launched_at = 1 WHERE id = 1   (set it back to NULL afterwards)`);
  }

  await page.evaluate(
    ({ keep, hideCounts }) => {
      if (keep) {
        for (const li of document.querySelectorAll("li.product-row, li.product-tile")) {
          const slug = li.querySelector('a[href^="/p/"]')?.getAttribute("href")?.split("/")[2];
          if (!slug || !keep.includes(slug)) li.remove();
        }
      }
      if (hideCounts) for (const el of document.querySelectorAll<HTMLElement>("[data-save-count]")) el.style.display = "none";
      // No caret, no hover state.
      (document.activeElement as HTMLElement | null)?.blur();
    },
    { keep: r.keepProducts ?? null, hideCounts: !!r.hideCounts },
  );
  // Load every image (lazy ones too) before the shot.
  await page.evaluate(async () => {
    for (const img of document.querySelectorAll("img")) img.loading = "eager";
    window.scrollTo(0, document.body.scrollHeight);
    window.scrollTo(0, 0);
    // decode() starts loading lazy images too and resolves once they can be painted.
    await Promise.all([...document.images].map((img) => img.decode().catch(() => null)));
    await document.fonts.ready;
  });

  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const targets: CaptureMeta["targets"] = {};
  for (const [t, selector] of Object.entries(r.targets ?? {})) {
    const box = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.left + window.scrollX, y: b.top + window.scrollY, w: b.width, h: b.height };
    }, selector);
    if (!box) fail(`capture "${name}": target "${t}" (${selector}) not found on ${r.route}`);
    targets[t] = box;
  }

  const file = (state?: string) => `captures/${name}${state ? `-${state}` : ""}.png`;
  const states: Record<string, string> = { default: file() };
  await page.screenshot({ path: path.join(paths.captures, "..", file()), fullPage: true });
  for (const [state, changes] of Object.entries(r.states ?? {})) {
    const before = await page.evaluate((cs) => cs.map((c) => Object.keys(c.attributes).map((a) => document.querySelector(c.selector)?.getAttribute(a) ?? null)), changes);
    await page.evaluate((cs) => {
      for (const c of cs) {
        const el = document.querySelector(c.selector);
        if (!el) throw new Error(`state selector not found: ${c.selector}`);
        for (const [a, v] of Object.entries(c.attributes)) el.setAttribute(a, v);
      }
    }, changes);
    await page.screenshot({ path: path.join(paths.captures, "..", file(state)), fullPage: true });
    states[state] = file(state);
    await page.evaluate(
      ({ cs, prev }) =>
        cs.forEach((c, i) =>
          Object.keys(c.attributes).forEach((a, j) => {
            const el = document.querySelector(c.selector)!;
            const v = prev[i]![j];
            if (v === null) el.removeAttribute(a);
            else el.setAttribute(a, v!);
          }),
        ),
      { cs: changes, prev: before },
    );
  }
  await page.close();

  const meta: CaptureMeta = { name, route: r.route, width: r.width, height, scale, states, targets };
  writeJson(path.join(paths.captures, `${name}.json`), meta);
  console.log(`✔ capture ${name}: ${WEB}${r.route} at ${r.width}px ×${scale}, ${Object.keys(states).length} state(s), targets ${Object.keys(targets).join(", ") || "none"}`);
  return meta;
}

if (process.argv[1]?.endsWith("capture.ts")) {
  await capturePages(idArg());
}
