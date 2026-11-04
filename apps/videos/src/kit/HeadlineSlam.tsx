import { fitText } from "@remotion/layout-utils";
import React, { useLayoutEffect, useState } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useDelayRender } from "remotion";
import { FONTS } from "../brand";
import { HEADLINE_SIZE, KIT, LAYOUT, TYPE, type LayoutMode } from "./tokens";

export interface HeadlineSlamProps {
  durationInFrames: number;
  /** The headline, broken into lines. */
  lines: string[];
  /** The frame each word lands, in reading order: its spoken frame. */
  wordFrames: number[];
  layout?: LayoutMode;
  /** One word in green. */
  accent?: string;
}

/** Fits the widest line to the safe column, inside the bible's headline sizes. */
function useHeadlineSize(lines: string[]): number {
  const [size, setSize] = useState<number>(HEADLINE_SIZE.min);
  const { delayRender, continueRender } = useDelayRender();
  const key = lines.join("\n");
  useLayoutEffect(() => {
    const handle = delayRender("Measuring the headline");
    void document.fonts.load(`700 100px "${FONTS.display}"`).then(() => {
      const fits = lines.map((text) => fitText({ text, withinWidth: LAYOUT.safe.w, fontFamily: FONTS.display, fontWeight: 700, letterSpacing: TYPE.headline.letterSpacing }).fontSize);
      setSize(Math.max(HEADLINE_SIZE.min, Math.min(HEADLINE_SIZE.max, Math.floor(Math.min(...fits)))));
      continueRender(handle);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return size;
}

/** A huge headline, word by word, a hard cut on each spoken word. The words keep their place from the first frame, so nothing reflows. */
export const HeadlineSlam: React.FC<HeadlineSlamProps> = ({ lines, wordFrames, layout = "centered", accent }) => {
  const frame = useCurrentFrame();
  const size = useHeadlineSize(lines);
  let n = 0;
  const centered = layout === "centered";
  return (
    <AbsoluteFill style={{ justifyContent: centered ? "center" : "flex-start", paddingTop: centered ? 0 : LAYOUT.safe.y + 40, paddingLeft: LAYOUT.editorialX, paddingRight: centered ? LAYOUT.editorialX : 180 }}>
      <div style={{ ...TYPE.headline, fontSize: size, textAlign: centered ? "center" : "left" }}>
        {lines.map((line) => (
          <div key={line} style={{ whiteSpace: "nowrap" }}>
            {line.split(/\s+/).map((word, i, all) => {
              const at = wordFrames[n++] ?? 0;
              const shown = frame >= at;
              const settle = interpolate(frame, [at, at + 3], [1.05, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              return (
                <span key={i} style={{ display: "inline-block", marginRight: i < all.length - 1 ? "0.22em" : 0, opacity: shown ? 1 : 0, transform: `scale(${settle})`, color: word.replace(/\W/g, "") === accent ? KIT.accent : KIT.text }}>
                  {word}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
