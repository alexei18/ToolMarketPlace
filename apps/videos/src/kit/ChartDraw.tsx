import { evolvePath, getLength, getPointAtLength } from "@remotion/paths";
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASE_IN_OUT, progress } from "../motion";
import { Illustrative } from "./CaptureView";
import { SERIES, type SeriesFact } from "./lib";
import { KIT, LAYOUT, TYPE } from "./tokens";

export interface ChartDrawProps {
  durationInFrames: number;
  kind: "line" | "bars";
  /** The name of a series read from the database (src/data/facts.json), never raw numbers. */
  series: SeriesFact;
  /** Bars: the first rows of the series. A line plots the whole series. */
  count?: number;
  title: string;
  /** Frames to draw. */
  drawFrames?: number;
  illustrative?: boolean;
}

const CHART = { x: LAYOUT.editorialX, y: 620, w: 804, h: 560 };

/** A line or bars drawing themselves, with the label following the peak. Editorial layout: left margin, title on top. */
export const ChartDraw: React.FC<ChartDrawProps> = ({ kind, series, count = 6, title, drawFrames = 70, illustrative = true }) => {
  const frame = useCurrentFrame();
  const rows = SERIES[series].slice(0, count);
  const draw = progress(frame, 0, drawFrames, EASE_IN_OUT);

  let body: React.ReactNode;
  if (kind === "bars") {
    const max = Math.max(...rows.map((r) => r.value));
    const barH = CHART.h / rows.length;
    body = rows.map((r, i) => {
      const grow = progress(frame, i * 7, 26);
      return (
        <div key={r.label} style={{ position: "absolute", left: CHART.x, top: CHART.y + i * barH, width: CHART.w, height: barH - 16 }}>
          <div style={{ ...TYPE.hud, height: 32, opacity: grow }}>{r.label}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 8 }}>
            <div style={{ width: (CHART.w - 90) * (r.value / max) * grow, height: barH - 72, borderRadius: 4, background: KIT.text }} />
            <div style={{ ...TYPE.headline, fontSize: 40, opacity: grow, color: KIT.text }}>{r.value}</div>
          </div>
        </div>
      );
    });
  } else {
    const running = SERIES[series].map((r) => r.value);
    const n = running.length;
    const total = Math.max(...running);
    const px = (i: number) => CHART.x + (i / (n - 1)) * CHART.w;
    const py = (v: number) => CHART.y + CHART.h - (v / total) * CHART.h;
    const d = running.map((v, i) => `${i === 0 ? "M" : "L"} ${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(" ");
    const length = getLength(d);
    const head = getPointAtLength(d, Math.max(0.01, length * draw))!;
    const evolved = evolvePath(draw, d);
    const shown = running[Math.min(n - 1, Math.round(interpolate(head.x, [CHART.x, CHART.x + CHART.w], [0, n - 1])))]!;
    body = (
      <>
        <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
          <line x1={CHART.x} x2={CHART.x + CHART.w} y1={CHART.y + CHART.h} y2={CHART.y + CHART.h} stroke="rgba(245,245,243,0.2)" />
          <path d={d} fill="none" stroke={KIT.text} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={evolved.strokeDasharray} strokeDashoffset={evolved.strokeDashoffset} />
          <circle cx={head.x} cy={head.y} r={11} fill={KIT.accent} />
        </svg>
        <div style={{ ...TYPE.headline, position: "absolute", fontSize: 72, left: Math.min(head.x + 20, CHART.x + CHART.w - 100), top: head.y - 86, color: KIT.text }}>{shown}</div>
      </>
    );
  }

  return (
    <AbsoluteFill>
      <div style={{ ...TYPE.headline, position: "absolute", left: LAYOUT.editorialX, top: LAYOUT.safe.y + 40, width: LAYOUT.safe.w, fontSize: 120, color: KIT.text }}>{title}</div>
      {body}
      {illustrative && <Illustrative style={{ position: "absolute", left: LAYOUT.editorialX, top: CHART.y + CHART.h + 36 }} />}
    </AbsoluteFill>
  );
};
