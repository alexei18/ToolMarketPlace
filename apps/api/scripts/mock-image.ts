/* Tiny PNG rasterizer for demo data: draws an abstract "app screenshot" from rectangles. */
import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

type RGB = [number, number, number];

export class Canvas {
  px: Uint8Array;
  constructor(
    public w: number,
    public h: number,
    bg: RGB,
  ) {
    this.px = new Uint8Array(w * h * 3);
    this.rect(0, 0, w, h, bg);
  }

  rect(x: number, y: number, w: number, h: number, c: RGB, radius = 0) {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.w, Math.round(x + w));
    const y1 = Math.min(this.h, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        if (radius) {
          const dx = xx < x0 + radius ? x0 + radius - xx : xx >= x1 - radius ? xx - (x1 - radius - 1) : 0;
          const dy = yy < y0 + radius ? y0 + radius - yy : yy >= y1 - radius ? yy - (y1 - radius - 1) : 0;
          if (dx * dx + dy * dy > radius * radius) continue;
        }
        const i = (yy * this.w + xx) * 3;
        this.px[i] = c[0];
        this.px[i + 1] = c[1];
        this.px[i + 2] = c[2];
      }
    }
  }

  png(): Uint8Array {
    const raw = new Uint8Array((this.w * 3 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 3 + 1)] = 0;
      raw.set(this.px.subarray(y * this.w * 3, (y + 1) * this.w * 3), y * (this.w * 3 + 1) + 1);
    }
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, this.w);
    dv.setUint32(4, this.h);
    ihdr.set([8, 2, 0, 0, 0], 8);
    const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", new Uint8Array())];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}

function hex(h: string): RGB {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}

/** A 1280×800 mock app UI in the product's color. `variant` changes the layout. */
export function mockScreenshot(color: string, variant: number, seed: number): Uint8Array {
  const W = 1280;
  const H = 800;
  const accent = hex(color);
  const white: RGB = [255, 255, 255];
  const ink: RGB = [28, 28, 30];
  const bg = mix(accent, white, 0.9);
  const c = new Canvas(W, H, bg);
  let r = seed;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);

  // Browser-ish window
  const wx = 64;
  const wy = 56;
  const ww = W - 128;
  const wh = H - 56;
  c.rect(wx, wy, ww, wh, white, 14);
  c.rect(wx, wy + 52, ww, 1, mix(accent, white, 0.82));
  c.rect(wx + 28, wy + 18, 18, 18, accent, 5);
  c.rect(wx + 56, wy + 22, 120, 10, mix(ink, white, 0.25), 4);
  for (let i = 0; i < 3; i++) c.rect(wx + 260 + i * 92, wy + 22, 64, 10, mix(ink, white, 0.75), 4);
  c.rect(wx + ww - 140, wy + 14, 112, 26, accent, 8);

  if (variant % 3 === 0) {
    // Sidebar + table
    c.rect(wx, wy + 53, 220, wh - 53, mix(accent, white, 0.95));
    for (let i = 0; i < 7; i++) c.rect(wx + 24, wy + 90 + i * 40, 120 + rnd() * 50, 10, mix(ink, white, i === 1 ? 0.2 : 0.7), 4);
    c.rect(wx + 260, wy + 90, 300, 22, ink, 6);
    c.rect(wx + 260, wy + 126, 420, 10, mix(ink, white, 0.6), 4);
    for (let row = 0; row < 8; row++) {
      const y = wy + 180 + row * 58;
      c.rect(wx + 260, y + 56, ww - 300, 1, mix(accent, white, 0.85));
      c.rect(wx + 260, y + 18, 26, 26, mix(accent, white, 0.5 + rnd() * 0.3), 13);
      c.rect(wx + 302, y + 20, 160 + rnd() * 120, 10, mix(ink, white, 0.25), 4);
      c.rect(wx + 302, y + 36, 100 + rnd() * 80, 8, mix(ink, white, 0.7), 4);
      c.rect(wx + ww - 260, y + 24, 70, 12, mix(ink, white, 0.6), 4);
      c.rect(wx + ww - 150, y + 20, 84, 20, rnd() > 0.5 ? mix(accent, white, 0.75) : mix(ink, white, 0.9), 10);
    }
  } else if (variant % 3 === 1) {
    // Dashboard: stat cards + chart
    c.rect(wx + 48, wy + 92, 320, 26, ink, 6);
    for (let i = 0; i < 3; i++) {
      const x = wx + 48 + i * ((ww - 96 - 48) / 3 + 24);
      const w = (ww - 96 - 48) / 3;
      c.rect(x, wy + 150, w, 120, mix(accent, white, 0.94), 12);
      c.rect(x + 24, wy + 178, 90, 9, mix(ink, white, 0.6), 4);
      c.rect(x + 24, wy + 204, 140 + rnd() * 60, 26, ink, 6);
    }
    const cx = wx + 48;
    const cy = wy + 300;
    const cw = ww - 96;
    const ch = 360;
    c.rect(cx, cy, cw, ch, mix(accent, white, 0.96), 12);
    const bars = 24;
    for (let i = 0; i < bars; i++) {
      const bh = 60 + Math.round((Math.sin(i / 3 + seed) * 0.5 + 0.5) * 200 + rnd() * 40);
      c.rect(cx + 32 + i * ((cw - 64) / bars), cy + ch - 28 - bh, (cw - 64) / bars - 10, bh, i === bars - 4 ? accent : mix(accent, white, 0.55), 4);
    }
  } else {
    // Editor: document + side panel
    c.rect(wx + ww - 330, wy + 53, 330, wh - 53, mix(accent, white, 0.95));
    c.rect(wx + 120, wy + 110, 520, 34, ink, 8);
    for (let i = 0; i < 11; i++) {
      const w = i % 4 === 3 ? 300 : 620 + rnd() * 60;
      c.rect(wx + 120, wy + 180 + i * 34, w, 11, mix(ink, white, i === 5 ? 0.2 : 0.62), 5);
    }
    c.rect(wx + 120, wy + 590, 680, 70, mix(accent, white, 0.85), 10);
    c.rect(wx + 144, wy + 616, 260, 12, accent, 5);
    for (let i = 0; i < 5; i++) {
      c.rect(wx + ww - 300, wy + 90 + i * 96, 270, 76, white, 10);
      c.rect(wx + ww - 280, wy + 110 + i * 96, 140 + rnd() * 60, 10, mix(ink, white, 0.3), 4);
      c.rect(wx + ww - 280, wy + 130 + i * 96, 200, 8, mix(ink, white, 0.7), 4);
    }
  }
  return c.png();
}
