import { LINK_MAX_FAILURES, QUALITY_MIN_DESCRIPTION_CHARS, markdownToText, type QualityChecksDTO } from "@tm/shared";

/** The quality conditions of docs/RANKING.md for Top, Trending and the digest (not for publishing). */
export function qualityChecks(
  p: { linkFailures: number; description: string; tagline: string },
  ctx: { hasImage: boolean; openReview: boolean },
): QualityChecksDTO {
  return {
    link: p.linkFailures < LINK_MAX_FAILURES,
    image: ctx.hasImage,
    description: markdownToText(p.description, Number.MAX_SAFE_INTEGER).length >= QUALITY_MIN_DESCRIPTION_CHARS,
    tagline: p.tagline.trim().length > 0,
    noOpenReview: !ctx.openReview,
  };
}

export function passesQuality(q: QualityChecksDTO): boolean {
  return q.link && q.image && q.description && q.tagline && q.noOpenReview;
}

/** An HTTP answer counts unless the page is gone (404/410) or the server failed (5xx). */
export function linkAnswered(status: number): boolean {
  return status < 500 && status !== 404 && status !== 410;
}
