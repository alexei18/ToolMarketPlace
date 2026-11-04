/* The kit's React components by name. */
import type React from "react";
import { ChromeMark } from "./ChromeMark";
import { ChromeWordmark } from "./ChromeWordmark";
import { FloatCard } from "./FloatCard";
import { HeadlineSlam } from "./HeadlineSlam";
import { LightSweep } from "./LightSweep";
import type { KitProps, KitScene } from "./scenes";
import { StageShot } from "./StageShot";

export const KIT_COMPONENTS: { [S in KitScene]: React.FC<KitProps[S]> } = {
  ChromeMark,
  ChromeWordmark,
  FloatCard,
  HeadlineSlam,
  LightSweep,
  Stage: StageShot,
};
