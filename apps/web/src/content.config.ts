import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/** Legal pages (docs/LEGAL.md): plain Markdown in src/content/legal, editable without touching code. */
const legal = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/legal" }),
  schema: z.object({
    title: z.string(),
    /** Meta description, at most 155 characters. */
    description: z.string().max(155),
    /** Shown as "Last updated". */
    updated: z.coerce.date(),
  }),
});

export const collections = { legal };
