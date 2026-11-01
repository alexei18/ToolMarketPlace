import type { ProductCardDTO } from "@tm/shared";
import { en } from "@tm/shared/copy";
import { JUST_LAUNCHED_MAX_AGE_HOURS } from "@tm/shared/ranking";

export type BadgeKind = "staffPick" | "justLaunched" | "aiPowered" | "foundingMaker" | "preLaunch";

/** Highest priority first. Cards show at most CARD_BADGES of these. */
const PRIORITY: BadgeKind[] = ["staffPick", "justLaunched", "aiPowered", "foundingMaker", "preLaunch"];
const CARD_BADGES = 2;

export interface Badge {
  kind: BadgeKind;
  label: string;
}

/**
 * Every badge a product has, highest priority first. In lists "Just launched" marks the Top slot;
 * on the product page (`page: true`) it marks a launch from the last 48 hours, and "Pre-launch"
 * uses the longer product-page text.
 */
export function badgesFor(p: ProductCardDTO, opts: { page?: boolean } = {}): Badge[] {
  const justLaunched = opts.page ? Date.now() / 1000 - p.publishedAt < JUST_LAUNCHED_MAX_AGE_HOURS * 3600 : !!p.justLaunched;
  const has: Record<BadgeKind, boolean> = {
    staffPick: p.staffPick,
    justLaunched,
    aiPowered: p.hasAi,
    foundingMaker: !!p.foundingMaker,
    preLaunch: p.stage === "beta",
  };
  return PRIORITY.filter((k) => has[k]).map((kind) => ({
    kind,
    label: kind === "preLaunch" && opts.page ? en.product.betaBadge : en.feed.badges[kind],
  }));
}

export function cardBadges(p: ProductCardDTO): Badge[] {
  return badgesFor(p).slice(0, CARD_BADGES);
}
