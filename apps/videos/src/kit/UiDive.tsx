import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { useCapture } from "../captures";
import { EASE_IN_OUT } from "../motion";
import { CursorTap, type CursorStop } from "../scenes/CursorTap";
import { Illustrative } from "./CaptureView";

export interface UiDiveKey {
  /** The camera reaches this point on this frame. */
  at: number;
  /** The page point at the center of the frame, CSS px. */
  x: number;
  y: number;
  /** Video px per CSS px. */
  zoom: number;
}

export interface UiDiveProps {
  durationInFrames: number;
  capture: string;
  keys: UiDiveKey[];
  /** The cursor goes to a captured element and clicks on this frame; the page switches to `state` if given. */
  clicks?: { at: number; target: string; state?: string }[];
}

function camera(keys: UiDiveKey[], frame: number) {
  const f = keys.map((k) => k.at);
  const value = (pick: (k: UiDiveKey) => number) => interpolate(frame, f, keys.map(pick), { easing: EASE_IN_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return { x: value((k) => k.x), y: value((k) => k.y), zoom: value((k) => k.zoom) };
}

/** The camera goes into the real interface, zooming and panning over the capture; a cursor clicks and the button's real states show. */
export const UiDive: React.FC<UiDiveProps> = ({ capture, keys, clicks = [] }) => {
  const frame = useCurrentFrame();
  const meta = useCapture(capture);
  const cam = camera(keys, frame);
  const state = clicks.filter((c) => c.state && frame >= c.at + 2).at(-1)?.state ?? "default";
  const toVideo = (x: number, y: number) => ({ x: 540 + (x - cam.x) * cam.zoom, y: 960 + (y - cam.y) * cam.zoom });
  const stops: CursorStop[] = clicks.map((c) => {
    const t = meta.targets[c.target]!;
    return { ...toVideo(t.x + t.w / 2, t.y + t.h / 2), at: c.at, tap: true };
  });
  if (stops[0]) stops.unshift({ x: stops[0].x + 180, y: stops[0].y + 340, at: stops[0].at - 18 });
  const left = 540 - cam.x * cam.zoom;
  const top = 960 - cam.y * cam.zoom;
  // Fast camera moves get the same treatment as everything else: blur in proportion to the speed.
  const next = camera(keys, frame + 1);
  const speed = Math.hypot((next.x - cam.x) * cam.zoom, (next.y - cam.y) * cam.zoom) + Math.abs(next.zoom - cam.zoom) * 90;
  return (
    <AbsoluteFill>
      <Img
        src={staticFile(meta.states[state] ?? meta.states.default!)}
        style={{ position: "absolute", left, top, width: meta.width * cam.zoom, height: meta.height * cam.zoom, maxWidth: "none", borderRadius: 18, filter: speed > 6 ? `blur(${Math.min(10, speed / 10)}px)` : undefined }}
      />
      <CursorTap stops={stops} frame={frame} />
      <Illustrative style={{ position: "absolute", left: 96, top: 1440, padding: "8px 14px", borderRadius: 8, background: "rgba(10,10,10,0.8)", color: "rgba(245,245,243,0.7)" }} />
    </AbsoluteFill>
  );
};
