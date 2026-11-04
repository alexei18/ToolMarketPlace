/* The kit's React components by name. */
import type React from "react";
import { ChartDraw } from "./ChartDraw";
import { ChromeMark } from "./ChromeMark";
import { ChromeWordmark } from "./ChromeWordmark";
import { CounterRoll } from "./CounterRoll";
import { FlashInvert } from "./FlashInvert";
import { FloatCard } from "./FloatCard";
import { FocusPull } from "./FocusPull";
import { GridPopulate } from "./GridPopulate";
import { HeadlineSlam } from "./HeadlineSlam";
import { HudFrame } from "./HudFrame";
import { KaraokeCaption } from "./KaraokeCaption";
import { LightSweep } from "./LightSweep";
import { ListCascade } from "./ListCascade";
import { MatchCut } from "./MatchCut";
import type { KitProps, KitScene } from "./scenes";
import { StageShot } from "./StageShot";
import { TypeBackspace } from "./TypeBackspace";
import { UiDive } from "./UiDive";
import { WireframeCollapse } from "./WireframeCollapse";

export const KIT_COMPONENTS: { [S in KitScene]: React.FC<KitProps[S]> } = {
  ChartDraw,
  ChromeMark,
  ChromeWordmark,
  CounterRoll,
  FlashInvert,
  FloatCard,
  FocusPull,
  GridPopulate,
  HeadlineSlam,
  HudFrame,
  KaraokeCaption,
  LightSweep,
  ListCascade,
  MatchCut,
  Stage: StageShot,
  TypeBackspace,
  UiDive,
  WireframeCollapse,
};
