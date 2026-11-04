/* The kit's React components by name. */
import type React from "react";
import { ChromeMark } from "./ChromeMark";
import type { KitProps, KitScene } from "./scenes";
import { StageShot } from "./StageShot";

export const KIT_COMPONENTS: { [S in KitScene]: React.FC<KitProps[S]> } = {
  ChromeMark,
  Stage: StageShot,
};
