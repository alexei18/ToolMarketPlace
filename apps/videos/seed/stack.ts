/*
 * The video-capture stack: its own container and D1 database (docker-compose.video.yml in the
 * sibling ToolMarketPlace-docker folder), never the dev or test database. The seed fills it and
 * every capture reads from it.
 */
import { run } from "../scripts/lib/common";
import { SEED_PRODUCTS } from "./products";

export const VIDEO_STACK = {
  container: process.env.VIDEO_CONTAINER ?? "toolmarket-video-app-1",
  web: (process.env.VIDEO_WEB_URL ?? "http://localhost:4331").replace(/\/$/, ""),
  api: (process.env.VIDEO_API_URL ?? "http://localhost:8797").replace(/\/$/, ""),
};

export const UP_COMMAND =
  "cd ../ToolMarketPlace-docker && docker compose -p toolmarket-video -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.video.yml up -d --build";

/** Refuses any container that isn't the video-capture stack (its compose file sets VIDEO_CAPTURE_DB=1). */
export async function assertVideoContainer(): Promise<void> {
  const marker = await run("docker", ["exec", VIDEO_STACK.container, "printenv", "VIDEO_CAPTURE_DB"]).then(
    (r) => r.stdout.toString().trim(),
    () => "",
  );
  if (marker !== "1") throw new Error(`${VIDEO_STACK.container} is not the video-capture stack (no VIDEO_CAPTURE_DB=1). Start it with:\n  ${UP_COMMAND}`);
}

/** Runs SQL on the video-capture database only; returns the rows of the last statement. */
export async function videoSql<T = Record<string, unknown>>(command: string): Promise<T[]> {
  await assertVideoContainer();
  const { stdout } = await run("docker", ["exec", "-w", "/app/apps/api", VIDEO_STACK.container, "bunx", "wrangler", "d1", "execute", "DB", "--local", "--json", "--command", command]);
  const out = JSON.parse(stdout.toString()) as { results: T[] }[];
  return out.at(-1)?.results ?? [];
}

/**
 * Captures must come from the seeded catalog: every product linked from /new must be a seed
 * product, otherwise the site isn't the video-capture database.
 */
export async function assertSeededSite(web: string): Promise<void> {
  const res = await fetch(`${web}/new`).catch(() => null);
  if (!res?.ok) throw new Error(`${web}/new answered ${res?.status ?? "nothing"}. Is the video-capture stack running and seeded (npm run video:seed)?\n  ${UP_COMMAND}`);
  const html = await res.text();
  const slugs = new Set([...html.matchAll(/href="\/p\/([a-z0-9-]+)"/g)].map((m) => m[1]!));
  const known = new Set(SEED_PRODUCTS.map((p) => p.slug));
  const foreign = [...slugs].filter((s) => !known.has(s));
  if (slugs.size === 0) throw new Error(`${web} lists no products: run npm run video:seed`);
  if (foreign.length) throw new Error(`${web} is not the seeded video-capture site: it lists ${foreign.join(", ")}`);
}
