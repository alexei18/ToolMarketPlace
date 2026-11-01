import { env } from "cloudflare:workers";

/** Server-side configuration read from wrangler vars. */
export function siteConfig() {
  const siteUrl = (env.SITE_URL || "http://localhost:4321").replace(/\/$/, "");
  return {
    siteName: env.SITE_NAME || "ToolMarket",
    siteUrl,
    apiUrl: (env.PUBLIC_API_URL || "http://localhost:8787").replace(/\/$/, ""),
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || "",
    googleEnabled: env.GOOGLE_ENABLED === "true",
    /** Legal pages show the draft banner until this is set to "false" after legal review. */
    legalDraft: env.LEGAL_DRAFT !== "false",
  };
}

export type SiteConfig = ReturnType<typeof siteConfig>;
