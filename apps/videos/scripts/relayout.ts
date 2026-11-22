/*
 * npm run video:relayout <ID>
 * Rewrites the line breaks of every KineticText beat in specs/<ID>.json to the most balanced lines
 * for its size (src/lib/kinetic.ts), so no line is wider than the 720 px column. The words, their
 * order, the size and every other prop stay as they are.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { balancedLines, fitKinetic } from "../src/lib/kinetic";
import type { VideoSpec } from "../src/lib/types";
import { idArg, paths } from "./lib/common";

const id = idArg();
const file = paths.spec(id);
const spec = JSON.parse(readFileSync(file, "utf8")) as VideoSpec;
let changed = 0;
for (const [i, b] of spec.beats.entries()) {
  if (b.scene !== "KineticText") continue;
  const p = b.props as { lines: string[]; size?: number };
  const before = p.lines;
  const lines = balancedLines(before.join(" "), p.size ?? 108);
  if (lines.join("|") !== before.join("|")) {
    p.lines = lines;
    changed++;
  }
  const fit = fitKinetic(p.lines, p.size ?? 108);
  console.log(`  beat ${i + 1}: ${p.lines.length} line(s) at ${fit.size} px (asked ${p.size ?? 108}): ${p.lines.join(" / ")}`);
}
if (changed) writeFileSync(file, JSON.stringify(spec, null, 2) + "\n");
console.log(`✔ ${id}: ${changed} beat(s) re-broken`);
