/* The kit's React components by name. */
import type React from "react";
import { ChromeMark } from "./ChromeMark";
import { ChromeWordmark } from "./ChromeWordmark";
import { FloatCard } from "./FloatCard";
import { FocusPull } from "./FocusPull";
import { HeadlineSlam } from "./HeadlineSlam";
import { HudFrame } from "./HudFrame";
import { LightSweep } from "./LightSweep";
import { MatchCut } from "./MatchCut";
import type { KitProps, KitScene } from "./scenes";
import { StageShot } from "./StageShot";
import { TypeBackspace } from "./TypeBackspace";
import { WireframeCollapse } from "./WireframeCollapse";

export const KIT_COMPONENTS: { [S in KitScene]: React.FC<KitProps[S]> } = {
  ChromeMark,
  ChromeWordmark,
  FloatCard,
  FocusPull,
  HeadlineSlam,
  HudFrame,
  LightSweep,
  MatchCut,
  Stage: StageShot,
  TypeBackspace,
  WireframeCollapse,
};
