import React from "react";
import { KIT_COMPONENTS } from "./components";
import type { KitBeat } from "./scenes";

/** Draws a beat given as data: the transitions hold their two sides this way, so the node scripts can read their cues too. */
export const BeatNode: React.FC<{ beat: KitBeat; durationInFrames: number }> = ({ beat, durationInFrames }) => {
  const Scene = KIT_COMPONENTS[beat.scene] as unknown as React.FC<Record<string, unknown>>;
  return <Scene {...beat.props} durationInFrames={durationInFrames} />;
};
