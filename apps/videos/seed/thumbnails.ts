/*
 * Product thumbnails for the video-capture seed: a neutral app window (gray structure, one muted
 * accent) with a layout that hints at what the product does. No text, no numbers, no logos.
 * Deterministic: the same product always gets the same image. 1600×1000 (the site's 16:10).
 */
import type { Browser } from "playwright";

export type ThumbLayout = "list" | "editor" | "timeline" | "swatches" | "code" | "chart" | "chat" | "inbox" | "grid" | "lock" | "tiles" | "form" | "rings" | "wave";

const W = 1600;
const H = 1000;
const LINE = "#E4E4DF";
const GRAY = "#DADAD5";
const GRAY_2 = "#ECECE8";

/** Small seeded generator, so layouts vary per product but never between runs. */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Mix a hex color with white (t > 0) or ink (t < 0). */
function mix(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const to = t >= 0 ? 255 : 17;
  const k = Math.abs(t);
  const c = (v: number) => Math.round(v + (to - v) * k).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

const rect = (x: number, y: number, w: number, h: number, fill: string, r = 10) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;
const bar = (x: number, y: number, w: number, fill = GRAY) => rect(x, y, w, 18, fill, 9);

/** The content area: x 400–1480, y 170–890. */
function content(layout: ThumbLayout, a: string, rand: () => number): string {
  const X = 400;
  const Y = 170;
  const out: string[] = [];
  const soft = mix(a, 0.82);
  const mid = mix(a, 0.45);
  switch (layout) {
    case "list":
      for (let i = 0; i < 6; i++) {
        const y = Y + 20 + i * 115;
        out.push(`<circle cx="${X + 40}" cy="${y + 34}" r="30" fill="${i === 1 ? mid : soft}"/>`, bar(X + 100, y + 14, 260 + rand() * 260, "#CFCFC9"), bar(X + 100, y + 44, 180 + rand() * 200), rect(X + 900, y + 18, 150, 34, i % 3 === 0 ? a : GRAY_2, 17));
        if (i < 5) out.push(rect(X, y + 92, 1060, 2, LINE, 1));
      }
      break;
    case "editor":
      out.push(rect(X + 120, Y + 30, 520, 34, "#C9C9C3", 12));
      for (let i = 0; i < 13; i++) {
        const y = Y + 110 + i * 46 + (i > 5 ? 40 : 0);
        const w = i === 5 || i === 12 ? 300 + rand() * 200 : 700 + rand() * 120;
        out.push(bar(X + 120, y, w));
        if (i === 2 || i === 8) out.push(rect(X + 120 + 160 + rand() * 300, y - 4, 150, 26, soft, 6));
      }
      out.push(rect(X + 960, Y + 110, 6, 560, soft, 3));
      break;
    case "timeline":
      out.push(rect(X + 20, Y + 10, 1040, 400, "#2A2A28", 18), `<polygon points="${X + 520},${Y + 170} ${X + 520},${Y + 250} ${X + 590},${Y + 210}" fill="#F4F4F1"/>`);
      for (let t = 0; t < 3; t++) {
        const y = Y + 450 + t * 85;
        out.push(rect(X + 20, y, 1040, 64, GRAY_2, 12));
        let x = X + 30;
        while (x < X + 980) {
          const w = 90 + rand() * 220;
          out.push(rect(x, y + 8, Math.min(w, X + 1050 - x), 48, t === 0 ? mid : t === 1 ? soft : GRAY, 9));
          x += w + 16;
        }
      }
      out.push(rect(X + 380, Y + 430, 4, 290, a, 2));
      break;
    case "swatches":
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 5; c++) {
          const t = 0.85 - c * 0.3 + (r === 2 ? -0.15 : 0);
          out.push(rect(X + 20 + c * 212, Y + 20 + r * 230, 188, 160, r === 1 ? mix("#8A8A84", Math.max(-0.6, Math.min(0.9, t))) : mix(a, Math.max(-0.6, Math.min(0.9, t))), 20), bar(X + 20 + c * 212, Y + 196 + r * 230, 110));
        }
      break;
    case "code":
      out.push(rect(X + 10, Y + 10, 1060, 700, "#232321", 18));
      for (let i = 0; i < 14; i++) {
        const y = Y + 50 + i * 46;
        const indent = [0, 1, 1, 2, 2, 1, 0, 0, 1, 2, 3, 2, 1, 0][i]! * 50;
        out.push(rect(X + 50, y, 26, 14, "#4A4A46", 7), rect(X + 110 + indent, y, 90 + rand() * 120, 14, i % 4 === 1 ? a : mix(a, 0.55), 7), rect(X + 230 + indent + rand() * 60, y, 120 + rand() * 260, 14, "#5C5C57", 7));
      }
      out.push(rect(X + 10, Y + 600, 1060, 110, mix(a, -0.55), 0));
      break;
    case "chart":
      out.push(rect(X + 20, Y + 10, 330, 120, GRAY_2, 16), rect(X + 375, Y + 10, 330, 120, GRAY_2, 16), rect(X + 730, Y + 10, 330, 120, soft, 16));
      for (let i = 0; i < 14; i++) {
        const h = 120 + rand() * 330;
        out.push(rect(X + 40 + i * 72, Y + 690 - h, 44, h, i === 10 ? a : mid, 8));
      }
      out.push(rect(X + 20, Y + 700, 1040, 3, LINE, 1));
      break;
    case "chat":
      for (let i = 0; i < 6; i++) {
        const right = i % 2 === 1;
        const w = 360 + rand() * 300;
        const y = Y + 20 + i * 112;
        out.push(rect(right ? X + 1060 - w : X + 20, y, w, 84, right ? soft : GRAY_2, 28), bar((right ? X + 1060 - w : X + 20) + 34, y + 33, w - 120, right ? mid : GRAY));
      }
      break;
    case "inbox":
      for (let i = 0; i < 7; i++) {
        const y = Y + 10 + i * 100;
        out.push(rect(X + 10, y, 380, 86, i === 1 ? soft : "#FFFFFF", 12), bar(X + 30, y + 22, 200, "#CFCFC9"), bar(X + 30, y + 52, 300));
      }
      out.push(rect(X + 420, Y + 10, 3, 700, LINE, 1), rect(X + 470, Y + 30, 420, 30, "#C9C9C3", 12));
      for (let i = 0; i < 6; i++) out.push(bar(X + 470, Y + 100 + i * 44, 480 + rand() * 100));
      out.push(rect(X + 470, Y + 420, 590, 220, soft, 16), bar(X + 500, Y + 460, 420, mid), bar(X + 500, Y + 500, 360, mid), rect(X + 900, Y + 590, 140, 36, a, 18));
      break;
    case "grid":
      for (let r = 0; r < 2; r++)
        for (let c = 0; c < 3; c++) {
          const x = X + 20 + c * 355;
          const y = Y + 10 + r * 355;
          out.push(rect(x, y, 330, 330, "#FFFFFF", 18), rect(x, y, 330, 210, (r + c) % 2 ? soft : GRAY_2, 18), bar(x + 20, y + 240, 200, "#CFCFC9"), rect(x + 20, y + 280, 110, 30, c === 1 && r === 0 ? a : GRAY, 15));
        }
      break;
    case "lock":
      out.push(rect(X + 290, Y + 60, 500, 600, "#FFFFFF", 28), `<path d="M${X + 470} ${Y + 300} v-70 a70 70 0 0 1 140 0 v70" stroke="${a}" stroke-width="26" fill="none"/>`, rect(X + 440, Y + 290, 200, 160, a, 22), `<circle cx="${X + 540}" cy="${Y + 360}" r="18" fill="#FFFFFF"/>`, bar(X + 360, Y + 510, 360), rect(X + 360, Y + 570, 360, 54, soft, 27));
      break;
    case "tiles":
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 6; c++) {
          const lit = rand() < 0.22;
          out.push(rect(X + 30 + c * 172, Y + 20 + r * 172, 156, 156, lit ? soft : r === 3 && c === 2 ? "#2A2A28" : GRAY_2, 18));
        }
      out.push(`<circle cx="${X + 30 + 3 * 172 + 78}" cy="${Y + 20 + 172 + 78}" r="46" fill="${a}"/>`, `<circle cx="${X + 30 + 3 * 172 + 78}" cy="${Y + 20 + 172 + 78}" r="74" fill="${a}" opacity="0.18"/>`);
      break;
    case "form":
      for (let i = 0; i < 4; i++) {
        const y = Y + 20 + i * 150;
        out.push(bar(X + 140, y, 200 + rand() * 120, "#CFCFC9"), rect(X + 140, y + 36, 640, 72, "#FFFFFF", 14), rect(X + 140, y + 36, 640, 72, "none", 14).replace('fill="none"', `fill="none" stroke="${i === 1 ? a : LINE}" stroke-width="3"`));
      }
      out.push(rect(X + 140, Y + 630, 220, 66, a, 33), rect(X + 860, Y + 20, 200, 660, soft, 18));
      break;
    case "rings": {
      const cx = X + 300;
      const cy = Y + 360;
      [220, 165, 110].forEach((r, i) => {
        const p = 0.55 + rand() * 0.35;
        const end = -Math.PI / 2 + p * 2 * Math.PI;
        out.push(`<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${GRAY_2}" stroke-width="40" fill="none"/>`);
        out.push(`<path d="M${cx} ${cy - r} A${r} ${r} 0 ${p > 0.5 ? 1 : 0} 1 ${cx + r * Math.cos(end)} ${cy + r * Math.sin(end)}" stroke="${[a, mid, soft][i]}" stroke-width="40" stroke-linecap="round" fill="none"/>`);
      });
      for (let i = 0; i < 5; i++) out.push(rect(X + 640, Y + 140 + i * 100, 400, 70, i === 0 ? soft : GRAY_2, 14), bar(X + 670, Y + 166 + i * 100, 160 + rand() * 120, i === 0 ? mid : GRAY));
      break;
    }
    case "wave":
      for (let i = 0; i < 52; i++) {
        const h = 30 + Math.abs(Math.sin(i * 0.55 + rand())) * 200;
        out.push(rect(X + 30 + i * 20, Y + 160 - h / 2, 10, h, i < 30 ? a : mid, 5));
      }
      for (let i = 0; i < 4; i++) out.push(rect(X + 20, Y + 330 + i * 98, 1040, 80, i === 0 ? soft : GRAY_2, 14), bar(X + 50, Y + 361 + i * 98, 300 + rand() * 400, i === 0 ? mid : GRAY));
      break;
  }
  return out.join("");
}

export function thumbnailSvg(seed: string, layout: ThumbLayout, accent: string): string {
  const rand = rng(seed);
  const sidebar = Array.from({ length: 7 }, (_, i) => rect(130, 200 + i * 62, i === 1 ? 210 : 150 + ((i * 37) % 70), 22, i === 1 ? mix(accent, 0.6) : GRAY, 11)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#F4F4F1"/>
<rect x="80" y="70" width="1440" height="860" rx="28" fill="#FFFFFF" stroke="${LINE}" stroke-width="3"/>
<rect x="80" y="70" width="1440" height="70" rx="28" fill="#FAFAF8"/><rect x="80" y="112" width="1440" height="28" fill="#FAFAF8"/>
<rect x="80" y="140" width="1440" height="2" fill="${LINE}"/>
<circle cx="125" cy="105" r="9" fill="${GRAY}"/><circle cx="155" cy="105" r="9" fill="${GRAY}"/><circle cx="185" cy="105" r="9" fill="${GRAY}"/>
<rect x="640" y="91" width="320" height="28" rx="14" fill="${GRAY_2}"/>
<rect x="360" y="142" width="2" height="786" fill="${LINE}"/>
<rect x="130" y="170" width="44" height="12" rx="6" fill="${accent}"/>
${sidebar}
${content(layout, accent, rand)}
</svg>`;
}

/** Rasterizes the SVG to PNG bytes. */
export async function thumbnailPng(browser: Browser, seed: string, layout: ThumbLayout, accent: string): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  try {
    await page.setContent(`<html><body style="margin:0">${thumbnailSvg(seed, layout, accent)}</body></html>`);
    return await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: W, height: H } });
  } finally {
    await page.close();
  }
}
