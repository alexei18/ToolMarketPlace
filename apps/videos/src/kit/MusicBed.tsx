import { Audio } from "@remotion/media";
import React from "react";
import { Sequence, staticFile } from "remotion";
import { duckDb, type KitTimeline } from "../lib/kit-timeline";

/** The track from its drop on, starting on the twist's frame, ducked under the voice. */
export const MusicBed: React.FC<{ src: string; music: KitTimeline["music"] }> = ({ src, music }) => (
  <Sequence from={music.from} durationInFrames={music.frames} layout="none" name="Music">
    <Audio src={staticFile(src)} trimBefore={music.trimBefore} volume={(f) => Math.pow(10, (music.gainDb + duckDb(music.from + f, music.duck)) / 20)} />
  </Sequence>
);
