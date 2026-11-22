import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FONTS, WORDMARK, WORDMARK_RATIO, themeColors } from "../brand";
import { TEXT_BLOCK } from "../lib/stage";
import { progress } from "../motion";

/**
 * The endscreen: the wordmark file itself (light, or the white file on dark; never redrawn or
 * recolored), "Join the waitlist" and "link in bio" (docs/tiktok-campaign.md). In a video it
 * starts on the spoken "Join" and "link in bio" lands on its spoken word (`linkAt`, frames from
 * the endscreen's start); without it (gallery, TEST-01) the lines follow each other.
 */
export const Endscreen: React.FC<{ variant: "light" | "dark"; linkAt?: number }> = ({ variant, linkAt }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const colors = themeColors(variant);
  const logoW = 560;
  const spoken = linkAt !== undefined;
  const logoIn = progress(frame, 0, spoken ? 10 : 14);
  const ctaIn = progress(frame, spoken ? 0 : 6, spoken ? 8 : 14);
  const bioAt = spoken ? linkAt : 11;
  const bioIn = progress(frame, bioAt, spoken ? 8 : 14);
  // The underline keeps drawing until the last frame, so the end never freezes.
  const underline = interpolate(frame, [bioAt + 3, durationInFrames - 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      <div style={{ position: "absolute", left: TEXT_BLOCK.x, top: TEXT_BLOCK.y, width: TEXT_BLOCK.w, height: TEXT_BLOCK.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <Img
          src={WORDMARK[variant]}
          alt="Tryworthy"
          style={{ width: logoW, height: logoW / WORDMARK_RATIO, opacity: logoIn, transform: `translateY(${(1 - logoIn) * 30}px)` }}
        />
        <div
          style={{
            marginTop: 96,
            fontFamily: FONTS.display,
            fontWeight: 700,
            fontSize: 76,
            letterSpacing: "-0.03em",
            color: colors.text,
            opacity: ctaIn,
            transform: `translateY(${(1 - ctaIn) * 24}px)`,
          }}
        >
          Join the waitlist
        </div>
        <div style={{ marginTop: 18, position: "relative", fontFamily: FONTS.body, fontWeight: 600, fontSize: 44, color: colors.accent, opacity: bioIn, transform: `translateY(${(1 - bioIn) * 18}px)` }}>
          link in bio
          <div style={{ position: "absolute", left: 0, bottom: -10, height: 5, borderRadius: 3, width: `${underline * 100}%`, background: colors.accent }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
