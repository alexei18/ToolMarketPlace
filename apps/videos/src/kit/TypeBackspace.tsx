import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { FONTS } from "../brand";
import { textAt, type TypeStep } from "./lib";
import { KIT, TYPE } from "./tokens";

export interface TypeBackspaceProps {
  durationInFrames: number;
  /** Each step erases back to what it shares with the text before, then types the rest. */
  steps: TypeStep[];
  /** A search bar around the text; without it, a large line of type. */
  field?: boolean;
}

const Magnifier: React.FC = () => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={KIT.secondary} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

/** Text typed with a cursor, erased and typed again, like a search someone is rethinking. */
export const TypeBackspace: React.FC<TypeBackspaceProps> = ({ steps, field = false }) => {
  const frame = useCurrentFrame();
  const text = textAt(steps, frame);
  const cursorOn = Math.floor(frame / 15) % 2 === 0;
  const size = field ? 56 : 96;
  const line = (
    <span style={{ fontFamily: FONTS.display, fontWeight: 600, fontSize: size, letterSpacing: "-0.02em", color: KIT.text, whiteSpace: "nowrap" }}>
      {text}
      <span style={{ display: "inline-block", width: size * 0.07, height: size * 1.05, marginLeft: 6, verticalAlign: "text-bottom", background: KIT.text, opacity: cursorOn ? 1 : 0 }} />
    </span>
  );
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {field ? (
        <div style={{ width: 840, height: 124, display: "flex", alignItems: "center", gap: 24, padding: "0 36px", borderRadius: 62, border: "2px solid rgba(245,245,243,0.22)", background: "rgba(245,245,243,0.05)" }}>
          <Magnifier />
          {line}
        </div>
      ) : (
        <div style={TYPE.headline}>{line}</div>
      )}
    </AbsoluteFill>
  );
};
