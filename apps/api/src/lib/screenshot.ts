import type { Env } from "../env";

/**
 * Takes a 1280×800 (16:10) screenshot of a page with Cloudflare Browser Rendering's REST API.
 * Returns null when Browser Rendering is not configured or the capture fails.
 */
export async function takeScreenshot(env: Env, url: string): Promise<Uint8Array | null> {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) return null;
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/screenshot`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        viewport: { width: 1280, height: 800 },
        gotoOptions: { waitUntil: "networkidle2", timeout: 15000 },
        screenshotOptions: { type: "jpeg", quality: 82 },
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) {
      console.error("[screenshot] failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    return new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    console.error("[screenshot] error", err);
    return null;
  }
}
