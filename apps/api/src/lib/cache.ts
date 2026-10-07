import type { Env } from "../env";

/** Web pages that show a product and must be refreshed after it changes. */
export function productPaths(slug: string, categorySlugs: string[] = []): string[] {
  return ["/", `/p/${slug}`, `/p/${slug}/feedback`, `/p/${slug}/roadmap`, ...categorySlugs.map((c) => `/c/${c}`)];
}

/**
 * Purges cached web pages after an edit. Uses the zone purge API when CF_ZONE_ID and CF_API_TOKEN
 * are set (purges every data center); otherwise pages simply expire with their short TTL (60 s – 5 min).
 */
export async function purgeWebPaths(env: Env, paths: string[]): Promise<void> {
  if (!env.CF_ZONE_ID || !env.CF_API_TOKEN || paths.length === 0) return;
  const origin = env.WEB_ORIGIN.replace(/\/$/, "");
  const files = [...new Set(paths)].map((p) => `${origin}${p}`);
  try {
    for (let i = 0; i < files.length; i += 30) {
      const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/purge_cache`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ files: files.slice(i, i + 30) }),
      });
      if (!res.ok) console.error("[cache] purge failed", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("[cache] purge error", err);
  }
}
