import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { SafeZoneOverlay } from "./components/SafeZoneOverlay";
import { BeatContext, type BeatContextValue } from "./context";
import type { Word } from "./lib/types";
import { CardReveal } from "./scenes/CardReveal";
import { CheckDraw } from "./scenes/CheckDraw";
import { Endscreen } from "./scenes/Endscreen";
import { KineticText } from "./scenes/KineticText";
import { LightSweep } from "./scenes/LightSweep";
import { StatOrQuote } from "./scenes/StatOrQuote";

/*
 * Studio preview of the reusable scenes with made-up word timings (one word every 0.3 s). Not a
 * video: real videos take every timing from words.json. Copy is from docs/COPY.md.
 */
const SLOT = 75;

function fakeWords(text: string): Word[] {
  return text.split(/\s+/).map((w, i) => ({ word: w, start: 0.2 + i * 0.3, end: 0.45 + i * 0.3 }));
}

const items: { text: string; theme: "light" | "dark"; node: React.ReactNode }[] = [
  { text: "New apps launch every day.", theme: "light", node: <KineticText lines={["New apps launch", "every day."]} mode="slam" highlight={["day"]} /> },
  { text: "Find the new apps worth trying", theme: "light", node: <KineticText lines={["Find the new apps", "worth trying"]} mode="typewriter" highlight={["worth", "trying"]} /> },
  { text: "Nobody can pay to rank", theme: "dark", node: <KineticText lines={["Nobody can pay", "to rank"]} mode="highlight" highlight={["pay"]} /> },
  {
    text: "Only on Tryworthy",
    theme: "light",
    node: <CardReveal front={{ title: "Pixelpress", text: "Compress images in your browser." }} back={{ badge: "Only on Tryworthy", title: "Member perk", text: "Perks makers give only here." }} flipCue="on" />,
  },
  { text: "Ranked by real people", theme: "dark", node: <LightSweep text="Ranked by real people" sweepCue="real" /> },
  { text: "Worth trying before everyone else", theme: "light", node: <CheckDraw text="Worth trying" secondCue="trying" /> },
  { text: "Makers can't pay to move up.", theme: "light", node: <StatOrQuote label="How ranking works" text="Makers can't pay to move up." /> },
];

export const GALLERY_FRAMES = SLOT * (items.length + 2);

export const Gallery: React.FC<{ debugSafeZone: boolean }> = ({ debugSafeZone }) => (
  <AbsoluteFill style={{ background: "#fff" }}>
    {items.map((it, i) => {
      const words = fakeWords(it.text);
      const ctx: BeatContextValue = { words, theme: it.theme, keywords: [], beatFrom: 0, cueFrame: 6, wordRange: [0, words.length] };
      return (
        <Sequence key={i} from={i * SLOT} durationInFrames={SLOT}>
          <BeatContext.Provider value={ctx}>{it.node}</BeatContext.Provider>
        </Sequence>
      );
    })}
    <Sequence from={items.length * SLOT} durationInFrames={SLOT}>
      <Endscreen variant="light" />
    </Sequence>
    <Sequence from={(items.length + 1) * SLOT} durationInFrames={SLOT}>
      <Endscreen variant="dark" />
    </Sequence>
    {debugSafeZone && <SafeZoneOverlay />}
  </AbsoluteFill>
);
