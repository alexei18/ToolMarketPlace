import React from "react";
import { Composition } from "remotion";
import type { CaptureMeta } from "./captures";
import { Gallery } from "./Gallery";
import { GALLERY_TOTAL } from "./kit/gallery-list";
import { GALLERY_FRAMES } from "./lib/gallery";
import { buildTimeline, FPS, HEIGHT, WIDTH } from "./lib/timeline";
import type { VideoSpec, Word } from "./lib/types";
import { StyleGallery } from "./StyleGallery";
import { Video } from "./Video";

// Specs, aligned words and capture metadata, found at bundle time. A spec shows up once
// `npm run video:prepare <ID>` has written its words.json.
declare const require: { context(dir: string, deep: boolean, re: RegExp): { keys(): string[]; (key: string): unknown } };
const specs = require.context("../specs", false, /\.json$/);
const wordFiles = require.context("../vo", false, /\.words\.json$/);
const captureFiles = require.context("../public/captures", false, /\.json$/);

const captures: Record<string, CaptureMeta> = Object.fromEntries(
  captureFiles.keys().map((k) => {
    const meta = captureFiles(k) as CaptureMeta;
    return [meta.name, meta];
  }),
);

const videos = specs
  .keys()
  .map((k) => specs(k) as VideoSpec)
  .flatMap((spec) => {
    const key = `./${spec.id}.words.json`;
    return wordFiles.keys().includes(key) ? [{ spec, words: wordFiles(key) as Word[] }] : [];
  });

export const Root: React.FC = () => (
  <>
    {videos.map(({ spec, words }) => (
      <Composition
        key={spec.id}
        id={spec.id}
        component={Video}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        durationInFrames={buildTimeline(spec, words, FPS).durationInFrames}
        defaultProps={{ spec, words, captures, debugSafeZone: false }}
      />
    ))}
    <Composition id="SceneGallery" component={Gallery} fps={FPS} width={WIDTH} height={HEIGHT} durationInFrames={GALLERY_FRAMES} defaultProps={{ debugSafeZone: true, captures }} />
    <Composition id="StyleGallery" component={StyleGallery} fps={FPS} width={WIDTH} height={HEIGHT} durationInFrames={GALLERY_TOTAL} />
  </>
);
