/*
 * npm run video:prepare <ID>: vo-clean → vo-align → video-check. Stops at the first failure.
 * The voice must exist first (vo/<ID>.wav: your recording, or npm run video:voice <ID>), and the
 * captures (npm run video:capture <ID>) for scenes that show the app.
 */
import path from "node:path";
import { idArg, paths } from "./lib/common";
import { alignVoice } from "./vo-align";
import { checkVoice } from "./video-check";
import { cleanVoice, setBeats } from "./vo-clean";

const id = idArg();
await cleanVoice(id);
await alignVoice(id);
// Marked pauses are set once the words are known, and the words read again on the final audio.
if ((await setBeats(id)).length) await alignVoice(id);
const report = await checkVoice(id);
const md = path.relative(process.cwd(), paths.checkReport(id).replace(/\.json$/, ".md"));
if (!report.pass) {
  console.error(`\n✖ video-check ${id}: FAIL — rendering is blocked. Report: ${md}`);
  for (const f of report.failures) console.error(`  - ${f}`);
  console.error("Fix pauses and pacing in the audio (never by stretching visuals), then run prepare again.");
  process.exit(1);
}
const s = report.stats;
console.log(`✔ video-check ${id}: PASS — ${s.videoSeconds} s video, ${s.wordsPerSecond} words/s, longest pause ${s.longestPause.toFixed(2)} s. Report: ${md}`);
