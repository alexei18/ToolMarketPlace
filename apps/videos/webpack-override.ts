import path from "node:path";
import { fileURLToPath } from "node:url";
import type { WebpackOverrideFn } from "@remotion/bundler";

// The Remotion CLI loads this file as CJS (import.meta is empty there), the scripts as ESM.
const here = typeof __dirname === "string" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

/** The brand tokens live in packages/shared; this project is a standalone npm package, so alias them. */
export const webpackOverride: WebpackOverrideFn = (config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {
      ...(config.resolve?.alias ?? {}),
      "@tm/shared/brand": path.resolve(here, "../../packages/shared/src/brand.ts"),
    },
  },
});
