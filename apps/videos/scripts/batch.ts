/*
 * npm run video:batch <BATCH>   e.g. TW-B01
 * Prepares (clean, align, check) and renders every spec of the batch (spec.batch, or ids starting
 * with "<BATCH>-"), one bundle for all, and ends with a summary table. A failing video doesn't stop
 * the others; the command exits non-zero if any failed.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fail, loadSpec, paths, ROOT, runScript } from "./lib/common";
import { bundleProject, renderVideo } from "./render";
import type { CheckReport } from "./video-check";

const batch = process.argv[2];
if (!batch) fail("Usage: npm run video:batch <BATCH>   e.g. TW-B01");
const ids = readdirSync(path.join(ROOT, "specs"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => loadSpec(f.replace(/\.json$/, "")))
  .filter((s) => s.batch === batch || s.id.startsWith(`${batch}-`))
  .map((s) => s.id)
  .sort();
if (ids.length === 0) fail(`No specs for batch ${batch} in specs/`);
if (ids.length !== 5) console.warn(`⚠ batch ${batch} has ${ids.length} specs (a batch is five videos)`);

const rows: { id: string; status: string; seconds?: number; words?: number; wps?: number; pause?: number }[] = [];
const prepared: string[] = [];
for (const id of ids) {
  // Each prepare in its own process: a failing check exits that process only.
  const code = await runScript("prepare", [id]);
  if (code !== 0) rows.push({ id, status: "video-check failed" });
  else prepared.push(id);
}
if (prepared.length) {
  const serveUrl = await bundleProject();
  for (const id of prepared) {
    try {
      const r = await renderVideo(id, serveUrl);
      const c = (JSON.parse(readFileSync(paths.checkReport(id), "utf8")) as CheckReport).stats;
      rows.push({ id, status: "rendered", seconds: r.seconds, words: c.words, wps: c.wordsPerSecond, pause: c.longestPause });
    } catch (e) {
      rows.push({ id, status: `render failed: ${(e as Error).message.split("\n")[0]}` });
    }
  }
}
console.log(`\nBatch ${batch}\n| ID | Status | Length (s) | Words | Words/s | Longest pause (s) |\n| --- | --- | --- | --- | --- | --- |`);
for (const r of rows.sort((a, b) => a.id.localeCompare(b.id))) {
  console.log(`| ${r.id} | ${r.status} | ${r.seconds?.toFixed(2) ?? ""} | ${r.words ?? ""} | ${r.wps ?? ""} | ${r.pause?.toFixed(2) ?? ""} |`);
}
if (rows.some((r) => r.status !== "rendered")) process.exit(1);
