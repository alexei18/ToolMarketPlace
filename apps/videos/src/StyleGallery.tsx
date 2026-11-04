import React, { useMemo } from "react";
import { Sequence } from "remotion";
import { CapturesContext, type CaptureMeta } from "./captures";
import { BeatNode } from "./kit/BeatNode";
import { galleryCues, GALLERY } from "./kit/gallery-list";
import { SoundLayer } from "./kit/SoundLayer";
import { Stage } from "./kit/Stage";
import { TYPE } from "./kit/tokens";

/** Every kit component on the Stage for 4–6 s with its sound. Internal: not a video to post. */
export const StyleGallery: React.FC<{ captures: Record<string, CaptureMeta> }> = ({ captures }) => {
  const cues = useMemo(() => galleryCues(), []);
  let from = 0;
  return (
    <CapturesContext.Provider value={captures}>
      {GALLERY.map((item) => {
        const at = from;
        from += item.frames;
        return (
          <Sequence key={item.name} from={at} durationInFrames={item.frames} name={item.name}>
            <Stage durationInFrames={item.frames} seed={item.name} drift={item.stage?.drift ?? true}>
              <BeatNode beat={item} durationInFrames={item.frames} />
            </Stage>
            <div style={{ ...TYPE.hud, position: "absolute", left: 56, top: 96 }}>{item.name}</div>
          </Sequence>
        );
      })}
      <SoundLayer cues={cues} />
    </CapturesContext.Provider>
  );
};
