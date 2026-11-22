import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { progress } from "../motion";
import { Illustrative } from "./CaptureView";
import { COUNTS, type CountFact } from "./lib";
import { KIT, TYPE } from "./tokens";

export interface CounterRollProps {
  durationInFrames: number;
  /** The name of a number read from the database (src/data/facts.json), never a raw number. */
  fact: CountFact;
  label: string;
  /** Frame the digits stop on the value. */
  settleAt: number;
  /** Optional: the digits dissolve into LED dots from this frame. */
  ledAt?: number;
  /** The facts come from the demo catalog: say so. Off only for production facts. */
  illustrative?: boolean;
}

const SIZE = 360;
const DIGIT_W = SIZE * 0.58;
const ROWS = 10;

/** 5×7 digits for the LED dots. */
const LED: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
};

/** A real number rolling up and stopping on its value, optionally dissolving into LED dots. */
export const CounterRoll: React.FC<CounterRollProps> = ({ fact, label, settleAt, ledAt, illustrative = true }) => {
  const frame = useCurrentFrame();
  const value = COUNTS[fact];
  const digits = String(value).split("");
  // Speeds up and stops dead, like the ticks.
  const t = interpolate(frame, [0, settleAt], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  const speed = frame < settleAt ? interpolate(frame, [0, settleAt], [0, 26], { easing: Easing.in(Easing.quad), extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const led = ledAt === undefined ? 0 : progress(frame, ledAt, 18);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {/* CSS blur has no direction; the digits only move up and down. */}
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <filter id="roll-blur">
          <feGaussianBlur stdDeviation={`0 ${speed}`} />
        </filter>
      </svg>
      <div style={{ position: "relative", display: "flex", height: SIZE * 1.02, overflow: "hidden" }}>
        {digits.map((d, i) => {
          // Each column runs through whole turns and lands on its digit exactly when the counter stops.
          const turns = digits.length - i + 1;
          const pos = (((Number(d) - ROWS * turns * (1 - t)) % ROWS) + ROWS) % ROWS;
          return (
            <div key={i} style={{ width: DIGIT_W, height: SIZE * 1.02, overflow: "hidden", position: "relative", opacity: 1 - led, filter: speed > 0.5 ? "url(#roll-blur)" : undefined }}>
              <div style={{ position: "absolute", top: -pos * SIZE * 1.02, left: 0, right: 0 }}>
                {[...Array(ROWS + 1).keys()].map((n) => (
                  <div key={n} style={{ ...TYPE.headline, fontSize: SIZE, height: SIZE * 1.02, lineHeight: `${SIZE * 1.02}px`, textAlign: "center", color: KIT.text, fontVariantNumeric: "tabular-nums" }}>
                    {n % ROWS}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {led > 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 32 }}>
            {digits.map((d, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "repeat(5, 30px)", gridAutoRows: "30px", gap: 8 }}>
                {(LED[d] ?? []).flatMap((row, y) => row.split("").map((on, x) => <div key={`${x}-${y}`} style={{ width: 30, height: 30, borderRadius: "50%", background: on === "1" ? KIT.text : "rgba(245,245,243,0.06)", opacity: led, transform: `scale(${0.4 + 0.6 * led})` }} />))}
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ ...TYPE.hud, marginTop: 36 }}>{label}</div>
      {illustrative && <Illustrative style={{ marginTop: 14 }} />}
    </AbsoluteFill>
  );
};
