import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";

/**
 * Called by the API worker after a product changes: purges cached pages by tag (Workers Cache).
 * Protected by a shared secret; reachable as /internal/purge.
 */
export const POST: APIRoute = async (ctx) => {
  const secret = env.PURGE_SECRET;
  if (!secret || ctx.request.headers.get("x-purge-secret") !== secret) return new Response("Forbidden", { status: 403 });
  const body = (await ctx.request.json().catch(() => null)) as { tags?: string[]; paths?: string[] } | null;
  const tags = (body?.tags ?? []).filter((t) => typeof t === "string" && t.length < 200).slice(0, 100);
  const paths = (body?.paths ?? []).filter((p) => typeof p === "string" && p.startsWith("/")).slice(0, 100);
  try {
    if (tags.length) await ctx.cache.invalidate({ tags });
    for (const path of paths) await ctx.cache.invalidate({ path });
  } catch (err) {
    // No cache provider in `astro dev`; pages expire on their own TTL anyway.
    console.warn("[purge] skipped:", err instanceof Error ? err.message : err);
    return Response.json({ purged: false });
  }
  return Response.json({ purged: { tags, paths } });
};
