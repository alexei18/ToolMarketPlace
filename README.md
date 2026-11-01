# ToolMarket

A web platform where makers publish new digital products and people discover them through a personal feed across 20 categories. It is built from the product spec *Platformă de descoperire produse digitale noi* and runs entirely on Cloudflare (Workers, D1, R2), sized to start on the free plan.

> **ToolMarket** is a working name. The site name comes from the `SITE_NAME` variable, so renaming means changing config and the logo, not code.

## What's in the MVP

All five phases of the spec are implemented:

| Phase | What works |
| --- | --- |
| 1. Foundation | Bun monorepo, Astro + Hono on Workers, D1 with Drizzle migrations, R2, Better Auth (Google + email/password), design system, 20 categories |
| 2. Publishing | Domain verification (DNS TXT or meta tag), publishing from a link with auto-fill (`og:*`/`twitter:image`, screenshot fallback), URL normalization and duplicate blocking, product pages, editing, posting limits |
| 3. Discovery | Personal feed, category pages with the visitor limit, FTS5 search with filters, saves, maker profiles, sitemap and SEO meta |
| 4. Interaction | Perks and claiming (shared coupons and unique codes), public/private feedback with replies, roadmap with votes, reports with auto-hide, admin panel, maker stats |
| 5. Retention | Notification center, web push (VAPID), PWA manifest, daily/weekly digest via Cron Triggers |

## Architecture

```
Browser ──► site worker (Astro, apps/web) ──service binding──► API worker (Hono, apps/api) ──► D1, R2
   │                │                                                │
   │                └── Workers Cache in front of public pages        ├── Cron Triggers (digest, cleanup, usage alerts)
   └──────────────── fetch with cookies ─────────────────────────────►└── Resend · Turnstile · Browser Rendering · Web Push
```

- **apps/web**: Astro 7 on Workers. Public pages (`/`, `/c/*`, `/p/*`, `/m/*`) are server-rendered without cookies and cached by the Workers Cache (60 s – 5 min). The API purges them by tag when a product changes. Personal bits (saved state, claimed codes, votes, header menu) load in the browser, so signed-in users get the cached page too. Public pages ship no React, only small scripts (~3 KB gzipped). React islands are used only for forms and dashboards.
- **apps/api**: Hono on Workers at `api.`, JSON only, reusable by a future mobile app. Better Auth handles `/auth/*`.
- **packages/db**: Drizzle schema and SQL migrations: Better Auth tables, the 17 app tables and an FTS5 index.
- **packages/shared**: Zod schemas, types, enums, limits, URL normalization and the limited-Markdown renderer, shared by both workers.

### Spec decisions and deviations

| Topic | Choice |
| --- | --- |
| Search index | FTS5 table keyed by `product_id` (kept in sync by triggers) instead of `content='products'`. `products` has a text primary key, so its implicit `rowid` is not guaranteed to be stable. |
| Password hashing | PBKDF2-SHA256 (100k iterations) from Web Crypto instead of Better Auth's default scrypt, which in pure JS would blow the free plan's 10 ms CPU budget. The iteration count is stored in each hash, so it can be raised later. |
| Email confirmation | People can use the site right after sign-up. Claiming perks, verifying domains and publishing need a confirmed email, and reports only count from confirmed accounts older than 7 days (as in the spec). |
| Account linking | Google sign-in links to an existing email account only if that account's email is confirmed (Better Auth default), which blocks pre-registration takeover. |
| Images | Validated by magic bytes (no SVG), then resized to ≤1600 px and re-encoded to WebP with the Cloudflare Images binding. They are stored in R2 under content-hash names and cached for a year. |
| Screenshot fallback | Browser Rendering REST API (needs `CF_ACCOUNT_ID` + `CF_API_TOKEN`). Without them, a product without `og:image` simply has no preview until the maker uploads one. |
| Views and clicks | Counted in isolate memory and written to D1 in batches. |
| Rate limits | Per-account daily limits are counted in D1. Requests are limited per IP (60/min) and per account (300/min) with the Rate Limiting binding. The site's own server-side API calls are exempt (they carry `INTERNAL_SECRET`). |
| Digest | Cron at 08:00 UTC (weekly subscribers on Mondays), plus 08:20 and 08:40 runs that continue large batches. With 03:00 maintenance and the 30-minute ranking job, this uses all 5 free-plan Cron Triggers. |
| Usage alerts | The daily job reads yesterday's usage from the GraphQL Analytics API. Above 70% of a free-plan limit, admins get a notification and an email. |

### Open decisions: what the code does now

| Open item | Current default | Where to change it |
| --- | --- | --- |
| Name and domain | `ToolMarket`, localhost | `SITE_NAME`, `WEB_ORIGIN`, `API_ORIGIN`, `SITE_URL`, logo in `apps/web/src/components/Logo.astro` |
| The 20 categories | AI, Developer Tools, Productivity, Design, Marketing, Sales & CRM, Writing, Video, Audio & Music, Finance, Education, Health & Fitness, No-Code, Analytics & Data, Collaboration, Customer Support, E-commerce, Security & Privacy, HR & Recruiting, Games & Fun | Seed in `packages/db/migrations/0001_fts_and_seed.sql`; admins can edit them in `/admin` |
| Accent and font | Deep green `#0E6B4B`, Inter 400/600 (self-hosted) | `--accent*` tokens and `@import`s in `apps/web/src/styles/global.css` |
| Visitor products per category | 12 | `VISITOR_CATEGORY_LIMIT` var |
| Report threshold | 3 | `REPORT_HIDE_THRESHOLD` var |
| Transactional email | Resend (prints to the console when no key is set) | `apps/api/src/lib/email.ts` |
| Monetization | Not built | — |

Every limit in `packages/shared/src/limits.ts` can be overridden with an API var of the same name (e.g. `PRODUCTS_PER_DAY`).

## Local development

Requirements: [Bun](https://bun.sh) 1.3+ and Node 22+ (Wrangler and Astro run on Node).

```sh
bun install
cp apps/api/.dev.vars.example apps/api/.dev.vars
cp apps/web/.dev.vars.example apps/web/.dev.vars
bun run vapid                           # optional: prints web push keys to paste into apps/api/.dev.vars
bun run db:migrate:local
bun run dev                             # API on :8787, site on :4321
```

In a second terminal, fill the local database with demo makers, products (with generated screenshots), perks, feedback and roadmaps:

```sh
bun run seed
```

Demo accounts (password `demo-password-123`): `alex@demo.dev` (member), `admin@example.com` (admin, via `ADMIN_EMAILS`), `mara@ledgerly.app` (maker).

Notes for local dev:

- Emails (confirmation, password reset) are printed in the API terminal when `RESEND_API_KEY` is empty. Open the link to confirm.
- `TURNSTILE_SECRET_KEY` in the example is Cloudflare's always-pass test key. Leave it empty to turn Turnstile off.
- Use `localhost` (not `127.0.0.1`) in the browser. Cookies and the API's origin check expect `http://localhost:4321`.
- The publish flow fetches the real page behind the link, so it needs internet access and a public `https` site.

### Checks

```sh
bun run test        # 82 tests: shared utils, API integration tests over a D1 stand-in, web helpers
bun run typecheck   # tsc for shared/db/api, astro check for the site
bun run build       # production build of the site
```

The API tests run the real Hono app and Better Auth against an in-memory SQLite that behaves like D1 (`apps/api/test/d1-shim.ts`). It runs the real migrations and rejects SQL transactions the way D1 does.

## Deploying to Cloudflare

1. **Create resources.** Create the database and bucket, then paste the database id into `apps/api/wrangler.jsonc`:
   ```sh
   cd apps/api
   bunx wrangler d1 create toolmarket
   bunx wrangler r2 bucket create toolmarket-images
   ```
2. **Domains.** Add routes: the site worker on `example.com`, the API on `api.example.com`, and point a custom domain such as `img.example.com` at the R2 bucket.
3. **Vars.** In `apps/api/wrangler.jsonc` set `WEB_ORIGIN`, `API_ORIGIN`, `IMAGES_BASE_URL=https://img.example.com`, `COOKIE_DOMAIN=example.com`, `ADMIN_EMAILS`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` and `EMAIL_FROM`. In `apps/web/wrangler.jsonc` set `SITE_URL`, `PUBLIC_API_URL`, `TURNSTILE_SITE_KEY`, `GOOGLE_ENABLED=true`, and `site` / `PUBLIC_SITE_URL` for the build.
4. **Secrets.**
   - API: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `VAPID_PRIVATE_KEY`, `INTERNAL_SECRET`, and optionally `CF_ACCOUNT_ID` + `CF_API_TOKEN` (screenshots, usage alerts).
   - Site: `INTERNAL_SECRET` (same value as the API).
   - Set each with `bunx wrangler secret put NAME`.
5. **Google OAuth.** Add the redirect URI `https://api.example.com/auth/callback/google`.
6. **Migrate and deploy.** Run `bun run db:migrate:remote`, then `bun run deploy` (API first, because the site binds to it). Optionally add `"services": [{ "binding": "WEB", "service": "toolmarket-web" }]` to the API config afterwards so cache purges use the binding.

### Legal pages before launch

The legal pages in `apps/web/src/content/legal/*.md` are drafts and show a "Draft — pending legal review" banner until `LEGAL_DRAFT` is set to `"false"` in `apps/web/wrangler.jsonc`, after a lawyer reviews them. Replace these placeholders first (`apps/web/src/lib/legal-content.test.ts` checks that this list is complete):

| Placeholder | Where | Fill in |
| --- | --- | --- |
| `[OPERATOR_NAME]` | legal, privacy, terms; footer (`OPERATOR_NAME` in `packages/shared/src/legal.ts`) | Legal name of the operator |
| `[OPERATOR_ADDRESS]` | legal, privacy, terms | Registered address |
| `[CONTACT_EMAIL]` | legal, privacy, terms, maker terms | General contact and contests |
| `[PRIVACY_EMAIL]` | legal, privacy | Data protection requests |
| `[DSA_CONTACT_EMAIL]` | legal, report | DSA point of contact and reports |
| `[EU_REPRESENTATIVE]` | legal, privacy | EU representative (DSA Art. 13, GDPR Art. 27), if needed |
| `[GOVERNING_LAW_COUNTRY]` | terms | Governing law and courts |
| `[MIN_AGE]` | terms, privacy; sign-up checkbox (`MIN_AGE` in `packages/shared/src/legal.ts`) | Minimum age, to confirm with the lawyer |

The API bundle is about 510 KB gzipped and the site worker stays well under the free plan's 3 MB limit. Move to the $5/month Workers plan when traffic needs it. The daily usage check warns at 70%.

## Repository layout

```
apps/
  api/        Hono worker: routes/, lib/ (auth helpers, fetcher, images, push…), jobs/ (digest, maintenance), test/, scripts/
  web/        Astro site: pages/, layouts/, components/ (Astro), islands/ (React), scripts/ (vanilla), styles/
packages/
  db/         Drizzle schema + migrations
  shared/     schemas, types, enums, limits, URL + Markdown helpers
```

## Later (after the MVP)

- Mobile app (React Native or Capacitor) for native push. iPhone web push works only from the Home Screen PWA.
- More languages, dark mode (the colors are already CSS variables), monetization.
