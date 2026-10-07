/// <reference types="astro/client" />

/** Minimal service-binding shape (workers-types is not loaded here: it clashes with DOM types in browser scripts). */
interface ServiceBinding {
  fetch(request: Request): Promise<Response>;
}

interface WebBindings {
  ASSETS: ServiceBinding;
  /** Service binding to the API worker (production). */
  API?: ServiceBinding;
  SITE_NAME: string;
  SITE_URL: string;
  PUBLIC_API_URL: string;
  TURNSTILE_SITE_KEY?: string;
  GOOGLE_ENABLED?: string;
  PURGE_SECRET?: string;
}

declare namespace Cloudflare {
  interface Env extends WebBindings {}
}

declare module "cloudflare:workers" {
  export const env: Cloudflare.Env;
}
