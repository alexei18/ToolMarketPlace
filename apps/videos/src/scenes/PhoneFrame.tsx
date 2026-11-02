import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";
import { COLORS, FONTS, themeColors } from "../brand";
import { useCapture } from "../captures";
import { cueFrameOf, useBeat } from "../context";
import { cameraAt, maxScroll as maxScrollOf, phoneLayout, targetRect, type ZoomSpec } from "../lib/phone";
import { EASE_IN_OUT, progress } from "../motion";
import { CursorTap, type CursorStop } from "./CursorTap";

export interface PhoneFrameProps {
  /** Capture name (public/captures/<name>.json), made by scripts/capture.ts from the real page. */
  capture: string;
  /** Page scroll (CSS px from the top), each reached on its cue word. The first entry may omit the cue. */
  scroll?: { cue?: string; y: number }[];
  /** Camera move onto a captured element on its cue word, so small UI is readable on a phone. */
  zoom?: ZoomSpec;
  /** Outline a captured element when its cue word is spoken. */
  highlight?: { cue: string; target: string };
  /** Cursor stops on captured elements; `tap` taps on the cue word. */
  cursor?: { cue: string; target: string; tap?: boolean }[];
  /** Switch to another captured state on a cue (e.g. "saved" right after the tap). */
  state?: { cue: string; name: string; delayFrames?: number };
  /** Small "Illustrative" label: demo products are fictional. On unless set to false. */
  illustrative?: boolean;
}

export const PhoneFrame: React.FC<PhoneFrameProps> = ({ capture, scroll = [], zoom, highlight, cursor = [], state, illustrative = true }) => {
  const ctx = useBeat();
  const meta = useCapture(capture);
  const colors = themeColors(ctx.theme);
  const { outer, screen, scale } = phoneLayout(meta);
  const f = ctx.absFrame;

  // Enter: the phone rises into place on the cue word.
  const enter = progress(f, ctx.cueFrame, 16);

  // Scroll between keyframes, each eased over 18 frames ending 12 frames after its cue.
  const maxScroll = maxScrollOf(meta);
  let scrollY = Math.min(scroll[0]?.y ?? 0, maxScroll);
  for (let i = 1; i < scroll.length; i++) {
    const at = cueFrameOf(ctx, ctx.fps, scroll[i]!.cue);
    const p = progress(f, at - 6, 18, EASE_IN_OUT);
    if (p > 0) scrollY = interpolate(p, [0, 1], [Math.min(scroll[i - 1]!.y, maxScroll), Math.min(scroll[i]!.y, maxScroll)]);
  }
  const finalScroll = Math.min(scroll.at(-1)?.y ?? 0, maxScroll);

  // Camera: eases in over 20 frames from 4 frames before its cue.
  const zoomT = zoom ? progress(f, cueFrameOf(ctx, ctx.fps, zoom.cue) - 4, 20, EASE_IN_OUT) : 0;
  const camera = cameraAt(meta, zoom, finalScroll, zoomT);

  const stateName = state && f >= cueFrameOf(ctx, ctx.fps, state.cue) + (state.delayFrames ?? 0) ? state.name : "default";
  const src = meta.states[stateName] ?? meta.states.default!;

  const hl = highlight ? targetRect(meta, highlight.target, scrollY) : null;
  const hlIn = highlight ? progress(f, cueFrameOf(ctx, ctx.fps, highlight.cue), 10) : 0;

  const stops: CursorStop[] = cursor.map((c, i) => {
    const r = targetRect(meta, c.target, scrollY);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2, at: cueFrameOf(ctx, ctx.fps, c.cue), tap: c.tap ?? i === cursor.length - 1 };
  });
  // The cursor comes in from below and to the right of its first stop.
  if (stops.length) stops.unshift({ x: stops[0]!.x + 140, y: stops[0]!.y + 220, at: stops[0]!.at - 16 });

  return (
    <AbsoluteFill style={{ backgroundColor: ctx.theme === "dark" ? COLORS.ink : COLORS.surface, overflow: "hidden" }}>
      {/* The camera keeps the phone's top edge in place, so the label stays just above it. */}
      {illustrative && (
        <div style={{ position: "absolute", left: outer.x, top: outer.y - 42, width: outer.w, textAlign: "center", fontFamily: FONTS.body, fontSize: 26, color: colors.muted, opacity: enter }}>
          Illustrative
        </div>
      )}
      <div style={{ position: "absolute", inset: 0, opacity: enter, transform: `translateY(${(1 - enter) * 140}px)` }}>
        <div style={{ position: "absolute", inset: 0, transformOrigin: "0 0", transform: camera.transform }}>
          <div
            style={{
              position: "absolute",
              left: outer.x,
              top: outer.y,
              width: outer.w,
              height: outer.h,
              borderRadius: 76,
              background: COLORS.ink,
              boxShadow: "0 40px 80px rgba(17,17,17,0.22), 0 0 0 2px rgba(255,255,255,0.06) inset",
            }}
          />
          <div style={{ position: "absolute", left: screen.x, top: screen.y, width: screen.w, height: screen.h, borderRadius: 62, overflow: "hidden", background: COLORS.bg }}>
            <Img src={staticFile(src)} style={{ position: "absolute", left: 0, top: -scrollY * scale, width: screen.w, height: meta.height * scale }} />
          </div>
          {hl && (
            <div
              style={{
                position: "absolute",
                left: hl.x - 8,
                top: hl.y - 8,
                width: hl.w + 16,
                height: hl.h + 16,
                borderRadius: 14,
                border: `4px solid ${colors.accent}`,
                boxShadow: `0 0 0 8px ${COLORS.accentSoft}`,
                opacity: hlIn,
                transform: `scale(${interpolate(hlIn, [0, 1], [1.05, 1])})`,
              }}
            />
          )}
          <CursorTap stops={stops} frame={f} size={44} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
