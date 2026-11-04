import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { progress } from "../motion";
import { BeatNode } from "./BeatNode";
import type { KitBeat } from "./scenes";
import { TYPE } from "./tokens";

export interface HudFrameProps {
  durationInFrames: number;
  /** Small monospace labels in the corners. Top right can be the running timecode instead. */
  labels: { topLeft?: string; topRight?: string; bottomLeft?: string; bottomRight?: string };
  /** Top right shows the running time of the shot. */
  timecode?: boolean;
  over?: KitBeat;
}

const BOX = { left: 56, right: 56, top: 190, bottom: 410 };

/** A thin frame and monospace corner labels, like a dashboard's HUD, for editorial scenes. */
export const HudFrame: React.FC<HudFrameProps> = ({ durationInFrames, labels, timecode = false, over }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const draw = progress(frame, 0, 18);
  const seconds = frame / fps;
  const time = `00:${String(Math.floor(seconds)).padStart(2, "0")}:${String(Math.floor((seconds % 1) * fps)).padStart(2, "0")}`;
  const line = "rgba(245,245,243,0.16)";
  const label = (text: string | undefined, style: React.CSSProperties) => text && <div style={{ ...TYPE.hud, position: "absolute", opacity: draw, ...style }}>{text}</div>;
  return (
    <AbsoluteFill>
      {over && <BeatNode beat={over} durationInFrames={durationInFrames} />}
      <div style={{ position: "absolute", left: BOX.left, top: BOX.top, height: 1, width: `calc((100% - ${BOX.left + BOX.right}px) * ${draw})`, background: line }} />
      <div style={{ position: "absolute", right: BOX.right, bottom: BOX.bottom, height: 1, width: `calc((100% - ${BOX.left + BOX.right}px) * ${draw})`, background: line }} />
      <div style={{ position: "absolute", left: BOX.left, top: BOX.top, width: 1, height: `calc((100% - ${BOX.top + BOX.bottom}px) * ${draw})`, background: line }} />
      <div style={{ position: "absolute", right: BOX.right, bottom: BOX.bottom, width: 1, height: `calc((100% - ${BOX.top + BOX.bottom}px) * ${draw})`, background: line }} />
      {label(labels.topLeft, { left: BOX.left + 24, top: BOX.top + 22 })}
      {label(timecode ? time : labels.topRight, { right: BOX.right + 24, top: BOX.top + 22 })}
      {label(labels.bottomLeft, { left: BOX.left + 24, bottom: BOX.bottom + 22 })}
      {label(labels.bottomRight, { right: BOX.right + 24, bottom: BOX.bottom + 22 })}
    </AbsoluteFill>
  );
};
