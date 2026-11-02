/* What counts as silence in a voice track. Used by vo-clean (to shorten pauses) and vo-check (to measure them). */

export interface SilenceMap {
  hop: number;
  threshold: number;
  /** First and last frame with sound. */
  first: number;
  last: number;
  /** Silent stretches strictly between the first and the last sound, in seconds. */
  pauses: { from: number; to: number }[];
}

/** Silence = 38 dB below the loudest 10 ms frame (never above -55 dBFS, for very quiet recordings). */
export function silenceMap(samples: Float32Array, rate: number, hopSeconds = 0.01): SilenceMap {
  const hop = Math.round(hopSeconds * rate);
  const frames = Math.floor(samples.length / hop);
  const db = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) sum += samples[i]! * samples[i]!;
    db[f] = 10 * Math.log10(sum / hop + 1e-12);
  }
  let peak = -Infinity;
  for (const v of db) peak = Math.max(peak, v);
  const threshold = Math.max(-55, peak - 38);
  const speech = Array.from(db, (v) => v > threshold);
  const first = speech.indexOf(true);
  const last = speech.lastIndexOf(true);
  const pauses: { from: number; to: number }[] = [];
  for (let f = Math.max(first, 0); f <= last; f++) {
    if (speech[f]) continue;
    let g = f;
    while (g <= last && !speech[g]) g++;
    pauses.push({ from: f * hopSeconds, to: g * hopSeconds });
    f = g;
  }
  return { hop: hopSeconds, threshold, first, last, pauses };
}
