import React from "react";
import { Sequence } from "remotion";
import { KIT_COMPONENTS } from "./kit/components";
import { GALLERY } from "./kit/gallery-list";
import { Stage } from "./kit/Stage";

/** Every kit component on the Stage for 4–6 s with its sound. Internal: not a video to post. */
export const StyleGallery: React.FC = () => {
  let from = 0;
  return (
    <>
      {GALLERY.map((item) => {
        const at = from;
        from += item.frames;
        const Scene = KIT_COMPONENTS[item.scene] as unknown as React.FC<Record<string, unknown>>;
        return (
          <Sequence key={item.name} from={at} durationInFrames={item.frames} name={item.name}>
            <Stage durationInFrames={item.frames} seed={item.name} drift={item.stage?.drift ?? true}>
              <Scene {...item.props} durationInFrames={item.frames} />
            </Stage>
          </Sequence>
        );
      })}
    </>
  );
};
