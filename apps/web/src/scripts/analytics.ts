/* Starts PostHog on every page (layouts/Base.astro) when the site has a token (lib/analytics.ts). */
import { initAnalytics } from "../lib/analytics";
import { hasSession } from "../lib/client";

const meta = document.querySelector<HTMLMetaElement>('meta[name="posthog"]');
if (meta?.content && meta.dataset.host) initAnalytics(meta.content, meta.dataset.host, hasSession());
