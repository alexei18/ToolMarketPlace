/*
 * npm run video:tracker <BATCH>   e.g. TW-B01
 * Creates or updates marketing/tiktok-tracker.xlsx (docs/tiktok-campaign.md, "Structura Excel-ului
 * de tracking"): five sheets, header on row 1, one record per row, no merged cells, dates as
 * "YYYY-MM-DD HH:MM", Video ID as the key. Claude Code's part is the Videos creation columns,
 * written here for every rendered video of the batch (an existing row is updated in place, never
 * duplicated). Columns UiPath writes (Planned post time, Posted at, TikTok URL, TikTok video ID, and
 * Status once it moves past Rendered) and every metric are never touched, and the other four sheets keep
 * whatever they hold. Formulas live only in Analysis, which Claude Code fills once metrics exist.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { fail, loadSpec, paths, ROOT } from "./lib/common";
import type { CheckReport } from "./vo-check";

const REPO = path.resolve(ROOT, "../..");
export const TRACKER = path.join(REPO, "marketing", "tiktok-tracker.xlsx");

export const SHEETS: Record<string, string[]> = {
  Videos: [
    "Video ID", "Batch", "Created at", "File path", "Cover path", "Title", "Caption", "Hashtags", "Cover text", "Pinned comment",
    "Music search", "AI-generated label", "Planned post time", "Audience", "Message", "Hook type", "Hook text", "Visual style", "Animation style",
    "Voice source", "Voice name", "Duration (s)", "Word count", "Words per second", "Parent videos", "Changed variable", "Status", "Posted at",
    "TikTok URL", "TikTok video ID",
  ],
  Metrics: [
    "Video ID", "Snapshot", "Captured at", "Views", "Likes", "Comments", "Shares", "Saves", "Avg watch time (s)", "Full-watch rate (%)",
    "New followers", "Profile views", "Traffic source For You (%)", "Traffic source other (%)",
  ],
  Signups: ["Date", "Explorer signups", "Maker signups", "From TikTok bio (utm)", "Found via TikTok", "Videos posted that day"],
  Analysis: ["Video ID", "Snapshot", "Share+save rate", "Comment rate", "Like rate", "Retention (avg watch / duration)", "Rank per metric in batch", "Score", "Rank in batch", "Top 2 (Yes/No)"],
  Learnings: ["Date", "Batch", "Snapshot", "Observation", "Evidence", "Hypothesis", "Action for next batch", "Status"],
};
export const headersOf = (sheet: string) => SHEETS[sheet]!;

/** Columns of Videos that UiPath (or the person scheduling) fills; the creation columns around them are ours. */
const UIPATH_COLUMNS = new Set(["Planned post time", "Posted at", "TikTok URL", "TikTok video ID"]);

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

function newWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  for (const name of Object.keys(SHEETS)) {
    const ws = wb.addWorksheet(name);
    ws.addRow(headersOf(name));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.columns.forEach((c, i) => (c.width = Math.min(48, Math.max(14, headersOf(name)[i]!.length + 4))));
  }
  return wb;
}

export async function openTracker(): Promise<ExcelJS.Workbook> {
  if (!existsSync(TRACKER)) return newWorkbook();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TRACKER);
  for (const name of Object.keys(SHEETS)) {
    const ws = wb.getWorksheet(name);
    if (!ws) fail(`${TRACKER} has no "${name}" sheet`);
    const have = headersOf(name).map((_, i) => String(ws.getRow(1).getCell(i + 1).value ?? ""));
    if (have.join("|") !== headersOf(name).join("|")) fail(`${TRACKER}: the "${name}" header doesn't match docs/tiktok-campaign.md.\n  expected: ${headersOf(name).join(" · ")}\n  found:    ${have.join(" · ")}`);
  }
  return wb;
}

export function batchIds(batch: string): string[] {
  return readdirSync(path.join(ROOT, "specs"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => loadSpec(f.replace(/\.json$/, "")))
    .filter((s) => s.batch === batch || s.id.startsWith(`${batch}-`))
    .map((s) => s.id)
    .sort();
}

/** The creation columns of one rendered video. */
export function videoRow(id: string): Record<string, string | number> {
  const spec = loadSpec(id);
  const m = spec.meta;
  if (!m?.caption || !m.hashtags || !m.pinnedComment || !m.musicSearch) fail(`${id}: the spec's meta needs caption, hashtags, pinnedComment and musicSearch`);
  if (m.caption.length < 100 || m.caption.length > 150) fail(`${id}: the caption has ${m.caption.length} characters (100–150)`);
  if (m.hashtags.length < 3 || m.hashtags.length > 5) fail(`${id}: ${m.hashtags.length} hashtags (3–5)`);
  const mp4 = paths.out(spec);
  const cover = paths.cover(spec);
  if (!existsSync(mp4) || !existsSync(cover)) fail(`${id}: render it first (npm run video:render ${id}); ${mp4} or its cover is missing`);
  const report = JSON.parse(readFileSync(paths.checkReport(id), "utf8")) as CheckReport;
  if (!report.pass) fail(`${id}: its vo-check didn't pass`);
  return {
    "Video ID": id,
    Batch: spec.batch ?? "",
    "Created at": stamp(statSync(mp4).mtime),
    "File path": path.resolve(mp4),
    "Cover path": path.resolve(cover),
    Title: m.title,
    Caption: m.caption,
    Hashtags: m.hashtags.join(" "),
    "Cover text": m.coverText,
    "Pinned comment": m.pinnedComment,
    "Music search": m.musicSearch,
    "AI-generated label": "Yes",
    Audience: m.audience,
    Message: m.message,
    "Hook type": m.hookType,
    "Hook text": m.hookText,
    "Visual style": m.visualStyle,
    "Animation style": m.animationStyle,
    "Voice source": "Google AI Studio (Gemini TTS)",
    "Duration (s)": report.stats.videoSeconds,
    "Word count": report.stats.words,
    "Words per second": report.stats.wordsPerSecond,
    "Changed variable": m.changedVariable ?? "",
    Status: "Rendered",
  };
}

export async function updateTracker(batch: string): Promise<{ added: string[]; updated: string[] }> {
  const wb = await openTracker();
  const ws = wb.getWorksheet("Videos")!;
  const headers = headersOf("Videos");
  const added: string[] = [];
  const updated: string[] = [];
  for (const id of batchIds(batch)) {
    const values = videoRow(id);
    // Look the video up without creating rows (getRows would add empty ones).
    let row: ExcelJS.Row | undefined;
    ws.eachRow((r, n) => {
      if (n > 1 && r.getCell(1).value === id) row = r;
    });
    const isNew = !row;
    if (!row) row = ws.addRow([]);
    headers.forEach((h, i) => {
      if (UIPATH_COLUMNS.has(h)) return;
      if (h === "Status" && !isNew && !["", "Rendered"].includes(String(row!.getCell(i + 1).value ?? ""))) return;
      if (h in values) row!.getCell(i + 1).value = values[h]!;
      else if (isNew) row!.getCell(i + 1).value = null;
    });
    row.commit();
    (isNew ? added : updated).push(id);
  }
  mkdirSync(path.dirname(TRACKER), { recursive: true });
  await wb.xlsx.writeFile(TRACKER);
  return { added, updated };
}

if (process.argv[1]?.endsWith("tracker.ts")) {
  const batch = process.argv[2];
  if (!batch) fail("Usage: npm run video:tracker <BATCH>   e.g. TW-B01");
  const r = await updateTracker(batch);
  console.log(`✔ ${path.relative(REPO, TRACKER)}: ${r.added.length} video(s) added, ${r.updated.length} updated`);
}
