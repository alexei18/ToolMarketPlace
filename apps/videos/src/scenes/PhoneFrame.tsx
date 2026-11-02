import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";
import { COLORS, FONTS, themeColors } from "../brand";
import { useCapture } from "../captures";
import { cueFrameOf, useBeat } from "../context";
import { lerpView, phoneLayout, scrollView, targetBox, toVideo, zoomView, type View, type ZoomSpec } from "../lib/phone";
import { EASE_IN_OUT, progress } from "../motion";
import { CursorTap, type CursorStop } from "./CursorTap";

export interface PhoneFrameProps {
  /** Capture name (public/captures/<name>.json), made by scripts/capture.ts from the real page. */
  capture: string;
  /** Page scroll (CSS px from the top), each reached on its cue word. The first entry may omit the cue. */
  scroll?: { cue?: string; y: number }[];
  /** Zoom inside the screen onto a captured element on its cue word; the phone itself never scales. */
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

/**
 * A fixed phone centered on x = 540 showing a real page capture. Scrolling and zooming move the
 * capture inside the screen; the bezel stays the same size and place. For a detail the voice
 * talks about, cut to a CardCrop instead of zooming far in.
 */
export const PhoneFrame: React.FC<PhoneFrameProps> = ({ capture, scroll = [], zoom, highlight, cursor = [], state, illustrative = true }) => {
  const ctx = useBeat();
  const meta = useCapture(capture);
  const colors = themeColors(ctx.theme);
  const { outer, screen } = phoneLayout(meta);
  const f = ctx.absFrame;

  // Enter: the phone rises into place on the cue word.
  const enter = progress(f, ctx.cueFrame, 16);

  // Scroll between keyframes, each eased over 18 frames ending 12 frames after its cue.
  let scrollY = scroll[0]?.y ?? 0;
  for (let i = 1; i < scroll.length; i++) {
    const p = progress(f, cueFrameOf(ctx, ctx.fps, scroll[i]!.cue) - 6, 18, EASE_IN_OUT);
    if (p > 0) scrollY = interpolate(p, [0, 1], [scroll[i - 1]!.y, scroll[i]!.y]);
  }
  // Zoom: eases in over 20 frames from 4 frames before its cue.
  const zoomT = zoom ? progress(f, cueFrameOf(ctx, ctx.fps, zoom.cue) - 4, 20, EASE_IN_OUT) : 0;
  const view: View = zoom ? lerpView(scrollView(meta, scrollY), zoomView(meta, zoom), zoomT) : scrollView(meta, scrollY);
  const k = screen.w / view.w;
  // Positions inside the screen element.
  const inScreen = (target: string) => {
    const r = toVideo(meta, view, targetBox(meta, target));
    return { ...r, x: r.x - screen.x, y: r.y - screen.y };
  };

  const stateName = state && f >= cueFrameOf(ctx, ctx.fps, state.cue) + (state.delayFrames ?? 0) ? state.name : "default";
  const src = meta.states[stateName] ?? meta.states.default!;

  const hl = highlight ? inScreen(highlight.target) : null;
  const hlIn = highlight ? progress(f, cueFrameOf(ctx, ctx.fps, highlight.cue), 10) : 0;

  const stops: CursorStop[] = cursor.map((c, i) => {
    const r = inScreen(c.target);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2, at: cueFrameOf(ctx, ctx.fps, c.cue), tap: c.tap ?? i === cursor.length - 1 };
  });
  // The cursor comes in from below and to the right of its first stop.
  if (stops.length) stops.unshift({ x: stops[0]!.x + 120, y: stops[0]!.y + 200, at: stops[0]!.at - 16 });

  return (
    <AbsoluteFill style={{ backgroundColor: ctx.theme === "dark" ? COLORS.ink : COLORS.surface, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, opacity: enter, transform: `translateY(${(1 - enter) * 140}px)` }}>
        {illustrative && (
          <div style={{ position: "absolute", left: outer.x, top: outer.y - 44, width: outer.w, textAlign: "center", fontFamily: FONTS.body, fontSize: 26, color: colors.muted }}>Illustrative</div>
        )}
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
          <Img src={staticFile(src)} style={{ position: "absolute", left: -view.x * k, top: -view.y * k, width: meta.width * k, height: meta.height * k, maxWidth: "none" }} />
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
