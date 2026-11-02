import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";
import { COLORS, FONTS, themeColors, uiSceneBg } from "../brand";
import { useCapture } from "../captures";
import { cueFrameOf, useBeat } from "../context";
import { cardLayout, cardToVideo } from "../lib/cardcrop";
import { targetBox } from "../lib/phone";
import { progress } from "../motion";
import { CursorTap, type CursorStop } from "./CursorTap";

export interface CardCropProps {
  /** Capture name (public/captures/<name>.json). Capture at device scale 3, at a page width where the element's text reaches 40/32 px at 720 px wide (vo-check). */
  capture: string;
  /** The captured element shown: the one card or row the voice talks about. */
  target: string;
  /** Cursor stops on captured elements inside the card; `tap` taps on the cue word. */
  cursor?: { cue: string; target: string; tap?: boolean }[];
  /** Switch to another captured state on a cue (e.g. "saved" right after the tap). */
  state?: { cue: string; name: string; delayFrames?: number };
  /** Outline a captured element inside the card when its cue word is spoken; a list outlines one after the other. */
  highlight?: { cue: string; target: string } | { cue: string; target: string }[];
  /** Bands of light crossing the card, each on its cue (dark, cinematic scenes). */
  sweep?: { cue: string } | { cue: string }[];
  /** Small "Illustrative" label: demo products are fictional. On unless set to false. */
  illustrative?: boolean;
}

/**
 * For detail beats: the real capture of one card or row, cut out of the page and shown about
 * 720 px wide, centered on x = 540 and on the middle of the safe band. Not rebuilt: the pixels
 * are the page's own.
 */
export const CardCrop: React.FC<CardCropProps> = ({ capture, target, cursor = [], state, highlight, sweep, illustrative = true }) => {
  const ctx = useBeat();
  const meta = useCapture(capture);
  const colors = themeColors(ctx.theme);
  const l = cardLayout(meta, target);
  const f = ctx.absFrame;
  const enter = progress(f, ctx.cueFrame, 12);

  const stateName = state && f >= cueFrameOf(ctx, ctx.fps, state.cue) + (state.delayFrames ?? 0) ? state.name : "default";
  const src = meta.states[stateName] ?? meta.states.default!;

  // One outline at a time: each leaves when the next one's cue is spoken.
  const highlights = (Array.isArray(highlight) ? highlight : highlight ? [highlight] : [])
    .map((h) => ({ box: cardToVideo(l, targetBox(meta, h.target)), at: cueFrameOf(ctx, ctx.fps, h.cue) }))
    .sort((a, b) => a.at - b.at)
    .map((h, i, all) => ({ ...h, show: progress(f, h.at, 10) * (all[i + 1] ? 1 - progress(f, all[i + 1]!.at, 6) : 1) }));
  // Each band of light crosses the card at a steady pace over about a second.
  const sweepXs = (Array.isArray(sweep) ? sweep : sweep ? [sweep] : []).map((s) => interpolate(progress(f, cueFrameOf(ctx, ctx.fps, s.cue) - 4, 32, (t) => t), [0, 1], [-40, 140]));

  const stops: CursorStop[] = cursor.map((c, i) => {
    const r = cardToVideo(l, targetBox(meta, c.target));
    return { x: r.x + r.w / 2, y: r.y + r.h / 2, at: cueFrameOf(ctx, ctx.fps, c.cue), tap: c.tap ?? i === cursor.length - 1 };
  });
  if (stops.length) stops.unshift({ x: stops[0]!.x + 140, y: stops[0]!.y + 240, at: stops[0]!.at - 16 });

  return (
    <AbsoluteFill style={{ backgroundColor: uiSceneBg(ctx.theme), overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, opacity: enter, transform: `translateY(${(1 - enter) * 60}px) scale(${interpolate(enter, [0, 1], [0.96, 1])})`, transformOrigin: "540px 840px" }}>
        {illustrative && (
          <div style={{ position: "absolute", left: l.card.x, top: l.card.y - 48, width: l.card.w, textAlign: "center", fontFamily: FONTS.body, fontSize: 26, color: colors.muted }}>Illustrative</div>
        )}
        <div
          style={{
            position: "absolute",
            left: l.card.x,
            top: l.card.y,
            width: l.card.w,
            height: l.card.h,
            borderRadius: 32,
            background: COLORS.bg,
            boxShadow: "0 30px 70px rgba(17,17,17,0.16), 0 0 0 1px rgba(17,17,17,0.06)",
          }}
        />
        <div style={{ position: "absolute", left: l.image.x, top: l.image.y, width: l.image.w, height: l.image.h, overflow: "hidden" }}>
          <Img
            src={staticFile(src)}
            style={{ position: "absolute", left: -l.crop.x * l.scale, top: -l.crop.y * l.scale, width: meta.width * l.scale, height: meta.height * l.scale, maxWidth: "none" }}
          />
        </div>
        {sweepXs.filter((x) => x > -40 && x < 140).map((sweepX, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: l.card.x,
              top: l.card.y,
              width: l.card.w,
              height: l.card.h,
              borderRadius: 32,
              pointerEvents: "none",
              mixBlendMode: "multiply",
              background: `linear-gradient(105deg, transparent ${sweepX - 14}%, ${COLORS.accentSoft} ${sweepX - 4}%, rgba(14,122,79,0.16) ${sweepX}%, ${COLORS.accentSoft} ${sweepX + 4}%, transparent ${sweepX + 14}%)`,
            }}
          />
        ))}
        {highlights.filter((h) => h.show > 0).map((h, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: h.box.x - 10,
              top: h.box.y - 10,
              width: h.box.w + 20,
              height: h.box.h + 20,
              borderRadius: 16,
              border: `5px solid ${COLORS.accent}`,
              boxShadow: `0 0 0 10px ${COLORS.accentSoft}`,
              opacity: h.show,
              transform: `scale(${interpolate(h.show, [0, 1], [1.05, 1])})`,
            }}
          />
        ))}
        <CursorTap stops={stops} frame={f} size={64} />
      </div>
    </AbsoluteFill>
  );
};
