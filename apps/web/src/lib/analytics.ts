/*
 * PostHog, cookieless (docs/ANALYTICS.md). Nothing is stored in the browser, so /cookies still needs
 * no banner. Off when POSTHOG_KEY is empty.
 */
// Slim build + only the extensions we use: ~half the size of the default bundle on every page.
// Always import posthog from this same path, or both bundles ship.
import posthog from "posthog-js/dist/module.slim";
import { AnalyticsExtensions, ErrorTrackingExtensions } from "posthog-js/dist/extension-bundles";

/** One-time tokens travel in links (waitlist confirm/unsubscribe, /join, /reset-password). */
const SECRET_PARAM = /([?&](?:t|token)=)[^&#\s"]*/g;

export function redactSecrets<T>(value: T): T {
  if (typeof value === "string") return value.replace(SECRET_PARAM, "$1redacted") as T;
  if (Array.isArray(value)) return value.map(redactSecrets) as T;
  // Plain objects only: the event's `timestamp` is a Date, which must reach posthog-js untouched.
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactSecrets(v)])) as T;
  }
  return value;
}

export function initAnalytics(key: string, host: string, signedIn: boolean) {
  posthog.init(key, {
    api_host: host,
    defaults: "2026-08-30",
    cookieless_mode: "always",
    // Recordings need a client-side session id, which cookieless mode doesn't keep.
    disable_session_recording: true,
    capture_exceptions: true,
    before_send: redactSecrets,
    __extensionClasses: { ...AnalyticsExtensions, ...ErrorTrackingExtensions },
  });
  // Invited makers and admins: lets dashboards leave them out while only the waitlist is public.
  posthog.register({ signed_in: signedIn });
}

/** A no-op when analytics is off. */
export function track(event: string, props?: Record<string, unknown>) {
  if (posthog.__loaded) posthog.capture(event, props);
}
