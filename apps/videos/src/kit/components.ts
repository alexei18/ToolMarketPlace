/* The kit's React components by name. */
import type React from "react";
import { ChromeMark } from "./ChromeMark";
import { ChromeWordmark } from "./ChromeWordmark";
import { FloatCard } from "./FloatCard";
import type { KitProps, KitScene } from "./scenes";
import { StageShot } from "./StageShot";

export const KIT_COMPONENTS: { [S in KitScene]: React.FC<KitProps[S]> } = {
  ChromeMark,
  ChromeWordmark,
  FloatCard,
  Stage: StageShot,
};
