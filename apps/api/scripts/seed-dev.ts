/*
 * Fills the LOCAL dev database with demo makers, products, perks, feedback and roadmaps.
 * Needs `bun run dev:api` running. Usage: bun run apps/api/scripts/seed-dev.ts
 *
 * It goes through the real API (sign-up, uploads, publishing) and only uses direct SQL for what
 * can't be done offline: confirming emails, verifying demo domains and spreading launch dates.
 */
import { TERMS_VERSION } from "@tm/shared";
import { mockScreenshot } from "./mock-image";

const API = process.env.API_URL ?? "http://localhost:8787";
const WEB = process.env.WEB_URL ?? "http://localhost:4321";
const PASSWORD = "demo-password-123";
const apiDir = new URL("..", import.meta.url).pathname;

async function sql(command: string) {
  const proc = Bun.spawn(["bunx", "wrangler", "d1", "execute", "DB", "--local", "--command", command], { cwd: apiDir, stdout: "pipe", stderr: "pipe" });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`SQL failed: ${command}\n${await new Response(proc.stderr).text()}`);
}

class Session {
  cookie = "";
  async req<T = any>(method: string, path: string, body?: unknown, raw?: BodyInit): Promise<T> {
    const headers: Record<string, string> = { origin: WEB };
    if (this.cookie) headers.cookie = this.cookie;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${API}${path}`, { method, headers, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    for (const c of res.headers.getSetCookie()) {
      const pair = c.split(";")[0]!;
      const name = pair.split("=")[0]!;
      const jar = new Map(this.cookie.split("; ").filter(Boolean).map((p) => [p.split("=")[0]!, p] as const));
      jar.set(name, pair);
      this.cookie = [...jar.values()].join("; ");
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
    return (text ? JSON.parse(text) : null) as T;
  }
}

async function account(email: string, name: string): Promise<{ s: Session; id: string }> {
  const s = new Session();
  try {
    const r = await s.req<{ user: { id: string } }>("POST", "/auth/sign-up/email", { email, password: PASSWORD, name, acceptedTerms: TERMS_VERSION });
    return { s, id: r.user.id };
  } catch {
    const r = await s.req<{ user: { id: string } }>("POST", "/auth/sign-in/email", { email, password: PASSWORD });
    return { s, id: r.user.id };
  }
}

interface Demo {
  maker: string;
  domain: string;
  color: string;
  products: {
    path: string;
    title: string;
    tagline: string;
    description: string;
    categories: string[];
    stage: "beta" | "launched";
    pricing: "free" | "freemium" | "paid";
    feedbackMode?: "public" | "private" | "off";
    roadmap?: boolean;
    daysAgo: number;
    perk?: { type: string; title: string; details?: string; sharedCode?: string; redeemUrl?: string; codes?: string[]; maxClaims?: number };
  }[];
}

const DEMOS: Demo[] = [
  {
    maker: "Mara Ionescu",
    domain: "ledgerly.app",
    color: "#2f6f5e",
    products: [
      {
        path: "",
        title: "Ledgerly",
        tagline: "Invoices that chase late payments for you",
        description:
          "Ledgerly sends polite reminders before and after an invoice is due, so you stop writing awkward follow-up emails.\n\n## What you get\n- Branded invoices in under a minute\n- Automatic reminders on a schedule you choose\n- Card and bank payments through Stripe\n\nBuilt by a freelancer who was tired of chasing clients.",
        categories: ["finance", "productivity"],
        stage: "launched",
        pricing: "freemium",
        roadmap: true,
        daysAgo: 0,
        perk: { type: "extended_trial", title: "3 months of Pro, free", details: "Unlimited clients and reminders.", redeemUrl: "https://ledgerly.app/redeem" },
      },
      {
        path: "/budgets",
        title: "Budgetbird",
        tagline: "Shared budgets for couples, without the spreadsheet",
        description: "Two people, one budget. Budgetbird splits shared costs, tracks who paid what and shows where the money went each month.",
        categories: ["finance"],
        stage: "beta",
        pricing: "free",
        daysAgo: 3,
      },
    ],
  },
  {
    maker: "Tom Becker",
    domain: "quietly.so",
    color: "#3b4a8c",
    products: [
      {
        path: "",
        title: "Quietly",
        tagline: "A focus timer that mutes Slack while you work",
        description: "Start a session and Quietly sets your Slack status, pauses notifications and turns them back on when you're done. Works with Google Calendar to protect your focus blocks.",
        categories: ["productivity", "collaboration"],
        stage: "launched",
        pricing: "freemium",
        feedbackMode: "public",
        roadmap: true,
        daysAgo: 0,
        perk: { type: "unique_codes", title: "1 year of Quietly Plus", codes: ["QUIET-7KD2", "QUIET-P9X4", "QUIET-Z3M8", "QUIET-L5C1"] },
      },
      {
        path: "/standup",
        title: "Daybrief",
        tagline: "Async standups in Slack that people actually answer",
        description: "Daybrief asks three short questions at the right time in each timezone and posts a tidy summary to your channel.",
        categories: ["collaboration", "hr"],
        stage: "launched",
        pricing: "paid",
        daysAgo: 1,
      },
    ],
  },
  {
    maker: "Ana Sârbu",
    domain: "pixelpress.dev",
    color: "#b4532a",
    products: [
      {
        path: "",
        title: "Pixelpress",
        tagline: "Compress images in your browser. Nothing is uploaded.",
        description: "Drop in PNG, JPG or WebP files and get smaller versions in seconds. Everything runs locally with WebAssembly, so client files never leave your laptop.",
        categories: ["design", "developer-tools"],
        stage: "launched",
        pricing: "free",
        feedbackMode: "public",
        daysAgo: 0,
      },
      {
        path: "/schema",
        title: "Schemawise",
        tagline: "Design your database visually, export real migrations",
        description: "Sketch tables and relations on a canvas, then export SQL migrations for Postgres, MySQL or SQLite. Diff two versions to get the migration between them.",
        categories: ["developer-tools"],
        stage: "beta",
        pricing: "freemium",
        roadmap: true,
        daysAgo: 2,
        perk: { type: "coupon", title: "40% off the first year", sharedCode: "SCHEMA40", redeemUrl: "https://pixelpress.dev/schema/pricing", maxClaims: 100 },
      },
    ],
  },
  {
    maker: "Julien Moreau",
    domain: "murmur.fm",
    color: "#6b3f8f",
    products: [
      {
        path: "",
        title: "Murmur",
        tagline: "Turn rambling voice memos into tidy notes",
        description: "Record a thought on your phone and Murmur transcribes it, removes the ums and turns it into a structured note with action items.",
        categories: ["ai", "audio", "productivity"],
        stage: "beta",
        pricing: "freemium",
        feedbackMode: "public",
        roadmap: true,
        daysAgo: 0,
        perk: { type: "free_trial", title: "30-day trial, no card", redeemUrl: "https://murmur.fm/start" },
      },
    ],
  },
  {
    maker: "Priya Natarajan",
    domain: "answerdesk.io",
    color: "#1f6f8b",
    products: [
      {
        path: "",
        title: "Answerdesk",
        tagline: "Draft support replies from your own help center",
        description: "Answerdesk reads your docs and past tickets and drafts a reply for every new conversation. Your team reviews and sends; nothing goes out on its own.",
        categories: ["customer-support", "ai"],
        stage: "launched",
        pricing: "paid",
        feedbackMode: "private",
        daysAgo: 1,
      },
      {
        path: "/quiz",
        title: "Quizmint",
        tagline: "Turn any PDF into spaced-repetition flashcards",
        description: "Upload lecture notes or a textbook chapter and get a deck of flashcards you can review on any device.",
        categories: ["education", "ai"],
        stage: "beta",
        pricing: "free",
        daysAgo: 4,
      },
    ],
  },
  {
    maker: "Diego Alvarez",
    domain: "cutroom.video",
    color: "#a23b48",
    products: [
      {
        path: "",
        title: "Cutroom",
        tagline: "Trim long videos into vertical clips automatically",
        description: "Upload a podcast or webinar recording and Cutroom finds the moments worth sharing, reframes them for vertical and adds captions.",
        categories: ["video", "marketing", "ai"],
        stage: "launched",
        pricing: "freemium",
        daysAgo: 0,
      },
    ],
  },
  {
    maker: "Hannah Lee",
    domain: "plainstats.com",
    color: "#4b6b2f",
    products: [
      {
        path: "",
        title: "Plainstats",
        tagline: "Privacy-first analytics in one script tag",
        description: "Page views, referrers and goals without cookies or consent banners. One script under 2 KB.",
        categories: ["analytics", "marketing"],
        stage: "launched",
        pricing: "freemium",
        feedbackMode: "public",
        roadmap: true,
        daysAgo: 5,
        perk: { type: "discount", title: "50% off for 6 months", sharedCode: "PLAIN50", redeemUrl: "https://plainstats.com/billing" },
      },
      {
        path: "/cart",
        title: "Cartwise",
        tagline: "Abandoned-cart emails for Shopify in five minutes",
        description: "Connect your store, pick a template and Cartwise sends a short sequence to shoppers who left items behind.",
        categories: ["ecommerce", "marketing"],
        stage: "launched",
        pricing: "paid",
        daysAgo: 6,
      },
    ],
  },
  {
    maker: "Oskar Nilsson",
    domain: "tinydungeon.games",
    color: "#7a5a1e",
    products: [
      {
        path: "",
        title: "Tiny Dungeon",
        tagline: "A roguelike you can finish on a coffee break",
        description: "Ten floors, one life, about seven minutes a run. Plays in the browser and on phones.",
        categories: ["games"],
        stage: "launched",
        pricing: "free",
        feedbackMode: "public",
        daysAgo: 2,
      },
      {
        path: "/vault",
        title: "Vaultline",
        tagline: "Share passwords with your team, no extra app",
        description: "Send a password as an encrypted one-time link that expires after it's read. End-to-end encrypted, no account needed to receive.",
        categories: ["security", "collaboration"],
        stage: "beta",
        pricing: "free",
        daysAgo: 8,
      },
    ],
  },
];

async function main() {
  console.log(`Seeding ${API} …`);
  await fetch(`${API}/health`).catch(() => {
    throw new Error("Start the API first: bun run dev:api");
  });

  const fan = await account("alex@demo.dev", "Alex Demo");
  const second = await account("sam@demo.dev", "Sam Rivers");
  const admin = await account("admin@example.com", "Admin");
  await sql(`UPDATE user SET email_verified = 1, created_at = created_at - 864000`);

  let seed = 1;
  const published: { id: string; slug: string; maker: Session; feedbackMode: string; roadmap: boolean; title: string }[] = [];
  for (const demo of DEMOS) {
    const email = `${demo.maker.split(" ")[0]!.toLowerCase()}@${demo.domain}`;
    const m = await account(email, demo.maker);
    await sql(`UPDATE user SET email_verified = 1 WHERE id = '${m.id}'`);
    await sql(
      `INSERT OR IGNORE INTO domains (id, user_id, hostname, token, method, verified_at, created_at) VALUES ('dom_${demo.domain.replace(/\W/g, "")}', '${m.id}', '${demo.domain}', 'demo', 'dns', unixepoch(), unixepoch())`,
    );
    for (const [idx, p] of demo.products.entries()) {
      const images: { key: string }[] = [];
      for (let v = 0; v < 2; v++) {
        const form = new FormData();
        form.append("file", new Blob([mockScreenshot(demo.color, idx + v, seed++)], { type: "image/png" }), "shot.png");
        const up = await m.s.req<{ key: string }>("POST", "/maker/uploads", undefined, form);
        images.push({ key: up.key });
      }
      let created: { id: string; slug: string };
      try {
        created = await m.s.req("POST", "/maker/products", {
          url: `https://${demo.domain}${p.path}`,
          title: p.title,
          tagline: p.tagline,
          description: p.description,
          categories: p.categories,
          stage: p.stage,
          pricing: p.pricing,
          feedbackMode: p.feedbackMode ?? "off",
          roadmapEnabled: p.roadmap ?? false,
          images,
        });
      } catch (err) {
        if (String(err).includes("DUPLICATE_URL")) {
          console.log(`  · ${p.title} already exists`);
          continue;
        }
        throw err;
      }
      const shift = p.daysAgo * 86400 + Math.floor(Math.random() * 6 * 3600);
      await sql(`UPDATE products SET published_at = published_at - ${shift}, updated_at = updated_at - ${shift}, view_count = ${50 + Math.floor(Math.random() * 900)}, click_count = ${5 + Math.floor(Math.random() * 120)} WHERE id = '${created.id}'`);
      if (p.perk) await m.s.req("PUT", `/maker/products/${created.id}/perks`, { perks: [p.perk] });
      published.push({ id: created.id, slug: created.slug, maker: m.s, feedbackMode: p.feedbackMode ?? "off", roadmap: p.roadmap ?? false, title: p.title });
      console.log(`  ✓ ${p.title}`);
    }
  }

  // Interests, saves, feedback, roadmap
  await fan.s.req("PUT", "/me/interests", { categories: ["ai", "productivity", "developer-tools", "design", "finance"] });
  await fan.s.req("PATCH", "/me/settings", { digestFrequency: "daily", bio: "Trying every new tool so you don't have to." });
  await second.s.req("PUT", "/me/interests", { categories: ["marketing", "analytics", "ecommerce"] });
  await admin.s.req("PUT", "/me/interests", { categories: ["ai", "security", "games"] });
  for (const p of published.slice(0, 6)) await fan.s.req("PUT", `/me/saves/${p.id}`).catch(() => {});
  for (const p of published.slice(2, 7)) await second.s.req("PUT", `/me/saves/${p.id}`).catch(() => {});

  const feedbackLines = [
    { type: "bug", body: "The export button does nothing on Safari 18. Works fine in Chrome." },
    { type: "idea", body: "A keyboard shortcut to start a session would be great." },
    { type: "praise", body: "Set it up in two minutes. This is exactly what I needed." },
    { type: "idea", body: "Dark mode, please!" },
  ];
  for (const p of published.filter((x) => x.feedbackMode !== "off")) {
    for (const [i, f] of feedbackLines.entries()) {
      const who = i % 2 ? second.s : fan.s;
      const created = await who.req<{ id: string }>("POST", `/products/${p.id}/feedback`, f).catch(() => null);
      if (created && i === 0) await p.maker.req("POST", `/feedback/${created.id}/reply`, { reply: "Thanks for the report! Fixed in today's release, give it another try." });
      if (created && i === 3 && p.roadmap) await p.maker.req("POST", `/products/${p.id}/roadmap`, { title: "Dark mode", fromFeedbackId: created.id });
    }
  }
  const roadmapItems = [
    { title: "Mobile app", description: "iOS first, Android after.", status: "planned" },
    { title: "Zapier integration", status: "in_progress" },
    { title: "Team workspaces", description: "Invite teammates and share settings.", status: "shipped" },
    { title: "CSV import", status: "planned" },
  ];
  for (const p of published.filter((x) => x.roadmap)) {
    for (const item of roadmapItems) {
      const created = await p.maker.req<{ id: string }>("POST", `/products/${p.id}/roadmap`, item).catch(() => null);
      if (created && item.status !== "shipped") {
        await fan.s.req("PUT", `/roadmap/${created.id}/vote`).catch(() => {});
        if (item.title === "Mobile app") await second.s.req("PUT", `/roadmap/${created.id}/vote`).catch(() => {});
      }
    }
  }

  console.log(`\nDone. Log in at ${WEB}/login with alex@demo.dev / ${PASSWORD} (member), admin@example.com / ${PASSWORD} (admin),`);
  console.log(`or a maker, e.g. mara@ledgerly.app / ${PASSWORD}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
