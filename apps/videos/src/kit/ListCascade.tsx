import { CameraMotionBlur } from "@remotion/motion-blur";
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { useCapture } from "../captures";
import { progress } from "../motion";
import { CaptureView, Illustrative } from "./CaptureView";

export interface ListCascadeProps {
  durationInFrames: number;
  capture: string;
  /** The capture's list of boxes, one per row. */
  boxes: string;
  /** How many rows. */
  count: number;
  /** The frame each row enters on: the music's beats in a video. */
  rowFrames: number[];
}

const WIDTH = 720;
const LEFT = 180;
const ENTER = 14;

const Rows: React.FC<ListCascadeProps> = ({ capture, boxes, count, rowFrames }) => {
  const frame = useCurrentFrame();
  const meta = useCapture(capture);
  const rows = (meta.boxes?.[boxes] ?? []).slice(0, count);
  // Rows are shown with the page's margins, so the text doesn't touch the edge.
  const s = WIDTH / meta.width;
  const totalH = rows.reduce((n, r) => n + r.h * s + 18, 0);
  let y = 960 - totalH / 2;
  return (
    <AbsoluteFill>
      {rows.map((r, i) => {
        const at = rowFrames[i] ?? 0;
        const p = progress(frame, at, ENTER);
        const top = y;
        y += r.h * s + 18;
        if (frame < at) return null;
        return (
          <div key={i} style={{ position: "absolute", left: LEFT + interpolate(p, [0, 1], [1100, 0]), top, opacity: interpolate(p, [0, 0.15], [0, 1], { extrapolateRight: "clamp" }) }}>
            <CaptureView capture={capture} region={{ ...r, x: 0, w: meta.width }} width={WIDTH} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** Real rows flying in from the side with motion blur, on the beats of the music. */
export const ListCascade: React.FC<ListCascadeProps> = (props) => {
  const frame = useCurrentFrame();
  // The camera blur renders the whole list once per sample, so it only runs while a row is moving.
  const moving = props.rowFrames.some((at) => frame >= at - 1 && frame < at + ENTER);
  const meta = useCapture(props.capture);
  const rows = (meta.boxes?.[props.boxes] ?? []).slice(0, props.count);
  const s = WIDTH / meta.width;
  const bottom = 960 + rows.reduce((n, r) => n + r.h * s + 18, 0) / 2;
  return (
    <AbsoluteFill>
      {moving ? (
        <CameraMotionBlur samples={8} shutterAngle={180}>
          <Rows {...props} />
        </CameraMotionBlur>
      ) : (
        <Rows {...props} />
      )}
      {frame >= (props.rowFrames[0] ?? 0) + ENTER && <Illustrative style={{ position: "absolute", left: LEFT, top: bottom + 12 }} />}
    </AbsoluteFill>
  );
};
