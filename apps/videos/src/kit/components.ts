/* The kit's React components by name. */
import type React from "react";
import { ChromeMark } from "./ChromeMark";
import type { KitProps, KitScene } from "./scenes";

export const KIT_COMPONENTS: { [S in KitScene]: React.FC<KitProps[S]> } = {
  ChromeMark,
};
