/*
 * Sizing for KineticText: the art-directed lines are kept and the type shrinks until the widest
 * one fits the 720 px column (never below MIN_SIZE). Pure, with the measured widths of the display
 * font, so the scene and vo-check agree.
 */
import { SAFE } from "./layout";
import { textWidth } from "./textwidth";

export const MIN_KINETIC_SIZE = 72;
/** Below this the text is still readable but no longer a hook (vo-check warns). */
export const SMALL_KINETIC_SIZE = 88;
/** Width of a word gap in the scene (0.24 em) against the table's space, plus a margin for kerning. */
const MARGIN = 1.03;

export function fitKinetic(lines: string[], size: number, maxWidth = SAFE.w): { size: number; fits: boolean; widest: string } {
  let widest = lines[0] ?? "";
  let per = 0;
  for (const l of lines) {
    const w = textWidth(l, 1);
    if (w > per) {
      per = w;
      widest = l;
    }
  }
  const fit = Math.floor(maxWidth / (per * MARGIN));
  return { size: Math.max(MIN_KINETIC_SIZE, Math.min(size, fit)), fits: fit >= MIN_KINETIC_SIZE, widest };
}

/**
 * Splits a phrase into lines for the column: the fewest lines whose type stays at 82% or more of
 * `size` (more lines only buy back type that would otherwise shrink a lot), then, among the splits
 * with the same widest line plus a little slack, the one with the most even line widths (no lone
 * short word). The scene then shrinks the type to fit the widest line.
 */
export function balancedLines(text: string, size: number, maxLines = 6, maxWidth = SAFE.w): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const n = words.length;
  const width = (a: number, b: number) => textWidth(words.slice(a, b).join(" "), 1);
  const partition = (k: number, cost: (w: number) => number, ok: (w: number) => boolean): string[] | null => {
    const dp = Array.from({ length: k + 1 }, () => Array<number>(n + 1).fill(Infinity));
    const cut = Array.from({ length: k + 1 }, () => Array<number>(n + 1).fill(0));
    dp[0]![0] = 0;
    for (let j = 1; j <= k; j++) {
      for (let i = j; i <= n; i++) {
        for (let t = j - 1; t < i; t++) {
          const w = width(t, i);
          if (!ok(w)) continue;
          const v = dp[j - 1]![t]! + cost(w);
          if (v < dp[j]![i]!) {
            dp[j]![i] = v;
            cut[j]![i] = t;
          }
        }
      }
    }
    if (!Number.isFinite(dp[k]![n]!)) return null;
    const lines: string[] = [];
    for (let j = k, i = n; j > 0; j--) {
      const t = cut[j]![i]!;
      lines.unshift(words.slice(t, i).join(" "));
      i = t;
    }
    return lines;
  };
  /** The narrowest widest line any split into k lines can reach. */
  const minimax = (k: number) => {
    let cap = Math.max(...words.map((w) => textWidth(w, 1)));
    while (!partition(k, () => 0, (w) => w <= cap)) cap *= 1.01;
    return cap;
  };
  let pick = 1;
  let widest = minimax(1);
  const asked = maxWidth / MARGIN / size; // widest line, per px of type, at the size asked for
  for (let k = 1; k <= Math.min(maxLines, n); k++) {
    pick = k;
    widest = minimax(k);
    if (widest <= asked / 0.82) break; // type stays at 82% of `size` or more
  }
  const cap = widest * 1.08;
  return partition(pick, (w) => (cap - w) ** 2, (w) => w <= cap) ?? [text];
}
