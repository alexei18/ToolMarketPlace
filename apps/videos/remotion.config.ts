import { Config } from "@remotion/cli/config";
import { webpackOverride } from "./webpack-override";

// Used by `npm run studio`. Renders go through scripts/render.ts, which applies the same settings.
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setCodec("h264");
Config.setOverwriteOutput(true);
Config.overrideWebpackConfig(webpackOverride);
