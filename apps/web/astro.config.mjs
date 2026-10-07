// @ts-check
import cloudflare from "@astrojs/cloudflare";
import { cacheCloudflare } from "@astrojs/cloudflare/cache";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "server",
  site: process.env.PUBLIC_SITE_URL ?? "http://localhost:4321",
  // Product images come from R2 (img. domain); no image transformation in the site worker.
  adapter: cloudflare({ imageService: "passthrough" }),
  integrations: [react()],
  // Public pages are cached by Cloudflare's Workers Cache in front of the worker (see Astro.cache.set
  // in the pages); the API purges them by tag when a product changes.
  cache: { provider: cacheCloudflare() },
  // Accounts live in the API worker (Better Auth); the site needs no server-side sessions.
  session: false,
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },
  build: { inlineStylesheets: "always" },
  server: { port: 4321, host: true },
  devToolbar: { enabled: false },
});
