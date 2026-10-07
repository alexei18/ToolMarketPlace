import type { Env } from "../env";

/** Web pages that show a product and must be refreshed after it changes. */
export function productPaths(slug: string, categorySlugs: string[] = []): string[] {
  return ["/", `/p/${slug}`, `/p/${slug}/feedback`, `/p/${slug}/roadmap`, ...categorySlugs.map((c) => `/c/${c}`)];
}

/** Cache tags the web pages set (see Astro.cache.set in apps/web): home, p:<slug>, c:<slug>. */
export function tagsForPaths(paths: string[]): string[] {
  const tags = new Set<string>();
  for (const p of paths) {
    if (p === "/") tags.add("home");
    const m = p.match(/^\/(p|c|m)\/([^/]+)$/);
    if (m) tags.add(`${m[1]}:${m[2]}`);
  }
  return [...tags];
}

/**
 * Purges cached web pages after an edit. The site worker owns its Workers Cache, so we ask it to
 * purge by tag (service binding WEB in production, WEB_ORIGIN otherwise). Without PURGE_SECRET,
 * pages simply expire with their short TTL (60 s – 5 min).
 */
export async function purgeWebPaths(env: Env, paths: string[]): Promise<void> {
  const unique = [...new Set(paths)];
  if (unique.length === 0 || !env.PURGE_SECRET) return;
  const req = new Request(`${env.WEB_ORIGIN.replace(/\/$/, "")}/internal/purge`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-purge-secret": env.PURGE_SECRET },
    body: JSON.stringify({ tags: tagsForPaths(unique), paths: unique }),
  });
  try {
    const res = env.WEB ? await env.WEB.fetch(req) : await fetch(req);
    if (!res.ok) console.error("[cache] purge failed", res.status);
  } catch (err) {
    console.error("[cache] purge error", err);
  }
}
