import { createContext, useContext } from "react";

/** Written by scripts/capture.ts next to each screenshot in public/captures/. Positions are CSS px on the page. */
export interface CaptureMeta {
  name: string;
  /** The app route that was captured, e.g. "/top". */
  route: string;
  /** Page width in CSS px (the viewport width). */
  width: number;
  /** Full page height in CSS px. */
  height: number;
  /** Device scale factor of the PNGs. */
  scale: number;
  /** State name → PNG path inside public/ ("default" is always there; e.g. "saved" with the save button pressed). */
  states: Record<string, string>;
  /**
   * Named elements → their box on the page, and the smallest visible text inside, in CSS px:
   * `name` for headings (product names), `secondary` for everything else.
   */
  targets: Record<string, { x: number; y: number; w: number; h: number; text?: { name?: number; secondary?: number } }>;
}

export const CapturesContext = createContext<Record<string, CaptureMeta>>({});

export function useCapture(name: string): CaptureMeta {
  const meta = useContext(CapturesContext)[name];
  if (!meta) throw new Error(`Capture "${name}" is missing: run npm run video:capture <ID>`);
  return meta;
}
