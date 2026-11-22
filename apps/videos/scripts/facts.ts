/*
 * npm run video:facts
 * Reads the numbers a video may show from the video-capture database into src/data/facts.json.
 * CounterRoll and ChartDraw take a fact's name, never a raw number, and video-check fails on any
 * other digit in a spec, so every number on screen is read from a database. This database holds the
 * fictional demo catalog, so these facts are for the gallery and test renders only, marked
 * Illustrative. A posted video needs its facts from the production database.
 */
import path from "node:path";
import { videoSql } from "../seed/stack";
import { ROOT, writeJson } from "./lib/common";

const one = async (sql: string) => Number((await videoSql<{ n: number }>(sql))[0]!.n);

const products = await one("SELECT COUNT(*) AS n FROM products WHERE published_at IS NOT NULL");
const perks = await one("SELECT COUNT(*) AS n FROM perks");
const byCategory = await videoSql<{ name: string; n: number }>(
  `SELECT c.name AS name, COUNT(*) AS n FROM product_categories pc
   JOIN categories c ON c.id = pc.category_id
   JOIN products p ON p.id = pc.product_id AND p.published_at IS NOT NULL
   GROUP BY c.id ORDER BY n DESC, c.name ASC`,
);

// Products published so far, in order: one point per product.
const published = await videoSql<{ at: number }>("SELECT published_at AS at FROM products WHERE published_at IS NOT NULL ORDER BY published_at");

const facts = {
  source: "video-capture database (fictional demo catalog, seed/products.ts)",
  demo: true,
  counts: { products, perks, categories: byCategory.length },
  series: {
    productsByCategory: byCategory.map((c) => ({ label: c.name, value: Number(c.n) })),
    productsPublished: published.map((_, i) => ({ label: "", value: i + 1 })),
  },
};
const file = path.join(ROOT, "src", "data", "facts.json");
writeJson(file, facts);
console.log(`✔ facts → ${path.relative(process.cwd(), file)}: ${JSON.stringify(facts.counts)}`);
