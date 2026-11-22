import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { CapturesContext, type CaptureMeta } from "./captures";
import { SafeZoneOverlay } from "./components/SafeZoneOverlay";
import { BeatContext, type BeatContextValue } from "./context";
import { GALLERY_SCENES, SLOT } from "./lib/gallery";
import type { Word } from "./lib/types";
import { CardCrop } from "./scenes/CardCrop";
import { CardReveal } from "./scenes/CardReveal";
import { CheckDraw } from "./scenes/CheckDraw";
import { Endscreen } from "./scenes/Endscreen";
import { KineticText } from "./scenes/KineticText";
import { LightSweep } from "./scenes/LightSweep";
import { StatOrQuote } from "./scenes/StatOrQuote";

/*
 * Studio preview of the reusable scenes with made-up word timings (one word every 0.3 s from
 * 0.2 s, so word i starts on frame 6 + 9i). Not a video: real videos take every timing from
 * words.json. Copy is from docs/COPY.md; demo products are from seed/products.ts. The slots'
 * names and key frames (for scripts/contact-sheet.ts) are in lib/gallery.ts, in the same order.
 */

function fakeWords(text: string): Word[] {
  return text.split(/\s+/).map((w, i) => ({ word: w, start: 0.2 + i * 0.3, end: 0.45 + i * 0.3 }));
}

const ITEMS: { name: string; text: string; theme: "light" | "dark"; node: React.ReactNode }[] = [
  { name: "KineticText slam", text: "New apps launch every day.", theme: "light", node: <KineticText lines={["New apps", "launch", "every day."]} mode="slam" highlight={["every", "day"]} size={140} /> },
  { name: "KineticText typewriter", text: "Find the new apps worth trying", theme: "light", node: <KineticText lines={["Find the new apps", "worth trying"]} mode="typewriter" highlight={["worth", "trying"]} /> },
  { name: "KineticText highlight", text: "Nobody can pay to rank", theme: "dark", node: <KineticText lines={["Nobody can pay", "to rank"]} mode="highlight" highlight={["pay"]} /> },
  {
    name: "CardReveal",
    text: "Only on Tryworthy",
    theme: "light",
    node: <CardReveal front={{ title: "Tallowbook", text: "Split shared costs and settle up in one tap" }} back={{ badge: "Only on Tryworthy", title: "Member perk", text: "Perks makers give only here." }} flipCue="on" />,
  },
  { name: "LightSweep", text: "Ranked by real people", theme: "dark", node: <LightSweep text="Ranked by real people" sweepCue="real" /> },
  { name: "CheckDraw", text: "Worth trying before everyone else", theme: "light", node: <CheckDraw text="Worth trying" secondCue="trying" /> },
  { name: "StatOrQuote", text: "Makers can't pay to move up.", theme: "light", node: <StatOrQuote label="How ranking works" text="Makers can't pay to move up." /> },
  {
    name: "CardCrop",
    text: "ranked by what real people save",
    theme: "light",
    node: <CardCrop capture="top-card" target="row1" cursor={[{ cue: "save", target: "save1", tap: true }]} state={{ cue: "save", name: "saved", delayFrames: 1 }} />,
  },
  { name: "Endscreen light", text: "", theme: "light", node: <Endscreen variant="light" /> },
  { name: "Endscreen dark", text: "", theme: "dark", node: <Endscreen variant="dark" /> },
];

if (ITEMS.some((it, i) => it.name !== GALLERY_SCENES[i]?.name) || ITEMS.length !== GALLERY_SCENES.length) throw new Error("Gallery.tsx and lib/gallery.ts list different scenes");

const Label: React.FC<{ name: string }> = ({ name }) => {
  const frame = useCurrentFrame();
  return <div style={{ position: "absolute", left: 24, top: 24, font: "700 34px monospace", color: "#111", background: "rgba(255,255,255,0.9)", padding: "6px 14px" }}>{`${name} · frame ${frame}`}</div>;
};

export const Gallery: React.FC<{ debugSafeZone: boolean; captures: Record<string, CaptureMeta> }> = ({ debugSafeZone, captures }) => (
  <CapturesContext.Provider value={captures}>
    <AbsoluteFill style={{ background: "#fff" }}>
      {ITEMS.map((it, i) => {
        const words = fakeWords(it.text || "end");
        const ctx: BeatContextValue = { words, theme: it.theme, keywords: [], beatFrom: 0, cueFrame: 6, wordRange: [0, words.length] };
        return (
          <Sequence key={i} from={i * SLOT} durationInFrames={SLOT} name={it.name}>
            <BeatContext.Provider value={ctx}>{it.node}</BeatContext.Provider>
            {debugSafeZone && <SafeZoneOverlay />}
            {debugSafeZone && <Label name={it.name} />}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  </CapturesContext.Provider>
);
