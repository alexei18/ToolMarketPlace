# Gap report: existing app vs. the positioning docs

Audited 2026-10-27 on branch `fix/ui-audit` at `14b6132`, plus an uncommitted change to `global.css` that has nothing to do with this audit. I read the code and did not run the app. Each section below covers one doc and says what **exists** (with paths), what is **missing**, and what **conflicts** with the current code, routes or D1 schema.

Paths are relative to the repo root. `api` = `apps/api/src`, `web` = `apps/web/src`, `db` = `packages/db/src/schema.ts`.

---

## Decisions needed before coding

These block or change later steps. Neither the docs nor the code answer them.

| # | Question | Why it matters | Blocks |
| --- | --- | --- | --- |
| D1 | **The "AI" category.** The seed lists `ai` as category #1 (`packages/shared/src/categories.ts`). POSITIONING says AI-powered is "a badge and a filter, not a separate category". Should `ai` be replaced by another general category (to keep 20), with its products migrated to `has_ai = true`? | It changes the seed, every product in `ai`, user interests and the SEO landing for AI | Steps 2, 3, 9 |
| D2 | **Brand name.** The code uses `SITE_NAME = "ToolMarket"` (`apps/api/wrangler.jsonc`, `web/lib/config.ts`, README). Every doc, title template and the About text say "ToolMarketPlace". **Resolved:** the brand is Tryworthy (https://tryworthy.app). | Every title, meta tag, email and legal text | Step 1 |
| D3 | **Is stage `beta` the same as "Pre-launch"?** `STAGES = ["beta", "launched"]`. COPY uses "Pre-launch". A public beta is usually already launched. | Badge, filter and the SEO stage meaning | Steps 2, 4 |
| D4 | **Is "API" a platform filter?** RANKING lists `web, iOS, Android, extensie, desktop, API`, but the COPY filter list leaves out API. POSITIONING accepts APIs. | The `platforms` enum and the filter UI | Step 2 |
| D5 | **Indexable AI landing page.** SEO targets `/top?ai=1` for the AI cluster, but SEO also says filtered URLs are never indexed (noindex plus a canonical to the unfiltered page). The two rules contradict each other. | Needs a clean path such as `/ai` or `/top/ai` | Steps 3, 8, 10 |
| D6 | **Where the PRELAUNCH flag lives.** PRELAUNCH.md and step 5 say env flag. Step 5.8 says an admin "Launch" action "sets PRELAUNCH off in config". A Worker can't change its own `vars` at runtime. | Env var (launch = redeploy) or a D1 settings row (no settings table exists today) | Step 5 |
| D7 | **What counts as an "open moderation case".** Any report with `outcome IS NULL`, including reports that don't count (`counts = 0`)? If so, one report from a brand-new account drops a product out of Top. | The quality_ok rule | Step 3 |
| D8 | **Unsave and un-vote.** `DELETE /me/saves/:id` and `DELETE /roadmap/:id/vote` exist. Does the signal stay, or is it removed? The docs don't say. | Signal semantics | Step 2 |
| D9 | **410 for `hidden`.** SEO says hidden or deleted products return 410. In this app `hidden` means "under review" and is reversible (`/admin/products/:id/restore`). A 410 tells Google the page is gone for good. Suggestion: 410 only for `removed`. | Indexing of restored products | Step 8 |
| D10 | **Scope of the copy rule.** The new CLAUDE.md rule says *all* user-facing copy is quoted from COPY.md. COPY.md covers only marketing and discovery surfaces. Auth, settings, dashboard, admin, errors and emails (hundreds of strings) have no source. Should functional UI strings be exempt, or added to COPY.md over time? | Step 1 can't finish under a literal reading | Step 1 |
| D11 | **"Only in the app" in onboarding.** Today the digest options are `daily / weekly / off`, and the digest always lands in the notification center, with push optional per device. Does "Only in the app" map to `off` (no digest at all)? | Digest enum and copy | Step 7 |

The pack's own open decisions (operator, minimum age, launch criteria, number of founding makers, monetization) are still in `docs/positioning-pack.md` and still apply.

---

## 1. POSITIONING.md

### Exists
| What | Where |
| --- | --- |
| 20 general categories, editable by admins | `packages/shared/src/categories.ts`, seeded in `packages/db/migrations/0001_fts_and_seed.sql`; `api/routes/admin.ts` `/admin/categories` |
| Any digital product can be listed from a link on a verified domain | `api/routes/maker.ts` `POST /maker/products/preview`, `POST /maker/products` |
| Verified makers (DNS TXT or meta tag) | `api/routes/me.ts` `/me/domains/:id/verify`, `packages/shared/src/verification.ts` |
| Free, with no payment or paid placement anywhere (supports "nobody can pay to rank") | README: "Monetization: Not built"; no payment fields in `db` |
| Perks made for members | `db` `perks`, `perk_codes`, `perk_claims`; `api/routes/interact.ts` `/perks/:id/claim` |

### Missing
- An AI-powered badge or filter. There is no `has_ai` field.
- Platforms (web, mobile, extension, desktop, API). They aren't stored.
- Pillar 2 ("ranked by real people"). There is no ranking (see §3).
- Any pre-launch or early-access concept beyond the `beta` stage label.

### Conflicts
- **The AI category** (D1).
- **The brand name** (D2).
- **The promise is still chronological** ("Înainte" in the pack). Examples: `web/pages/index.astro:38` "New software, the day it ships.", `web/components/Footer.astro:11` "New digital products, the day they launch", `web/layouts/Base.astro:33` default title "New digital products, every day".
- **Words that are now banned already appear in the UI:**
  - `web/pages/c/[slug].astro:79` "A free account **unlocks** the full list…"
  - `web/pages/feed.astro:25` "Perks and publishing are **unlocked**."
  - `web/components/ProductRow.astro:51` renders `#{rank}`, so the first row would show "#1". It is dead today, because `ranked` is never passed to `ProductList`. Under the literal CLAUDE.md rule it must not be switched on for Top.
- Numbers rule: **no violation found.** The homepage facts (`index.astro:48-49`), category counts and save counts all come from D1.

---

## 2. COPY.md

### Exists (matches or is close)
| COPY item | Current | Where |
| --- | --- | --- |
| Onboarding H1 "What are you into?" | Exact match | `web/islands/Onboarding.tsx:96` |
| "Pick at least 3" | `INTERESTS_MIN = 3` is enforced, but the wording differs | `packages/shared/src/limits.ts`, `Onboarding.tsx:97` |
| Daily and weekly digest | Exists, plus `off` | `Onboarding.tsx:16-20` |
| "Nothing new → nothing is sent" | Exists | `api/jobs/digest.ts` (users with no rows are skipped) |
| Visitor banner after the limit | A gate exists with different copy | `web/components/SignupGate.astro`, `c/[slug].astro:79`, `VISITOR_CATEGORY_LIMIT = 12` |
| Price labels Free / Freemium / Paid | Exact | `web/lib/format.ts:4` |

### Missing
- **No copy module.** `packages/shared/src/copy/` doesn't exist, and every string is hard-coded in `.astro` and `.tsx` files.
- Homepage: the "Launching soon" label, H1 A/B, subtitle, both primary CTAs, trust line, problem section, the 3 steps, the 4 benefits, the creators block, and both makers blocks.
- Tabs (Top this week, Trending, New), the explanation line and the "How ranking works" link.
- Badges: Staff pick, AI-powered, Just launched, Founding maker, Pre-launch.
- Filters: AI-powered, Pre-launch / Launched, platforms. Pricing, stage and has-perk exist only on `/search` (`packages/shared/src/schemas.ts` `searchQuerySchema`), not on category pages.
- Onboarding: the new subtitle, "(recommended)", "Only in the app", and both final screens (there is no final screen today).
- Category H1, intro and visitor banner text.
- Product page: "Only on Tryworthy", "Sign in to claim this perk" (today visitors see "Claim" and are sent to login, `web/scripts/product.ts:74`), the beta badge, and the feedback prompt.
- The `/ranking` page, the `/about` page, the launch-day notification.

### Conflicts (current text → what COPY says)
| Where | Current | COPY.md |
| --- | --- | --- |
| `index.astro:38` | "New software, the day it ships." | H1 A or B |
| `index.astro:40` | "Makers list what they just launched…" | Subtitle |
| `index.astro:43` | "Create a free account" | "Build my feed — free" / "Reserve your feed — free" |
| `index.astro:44` | "See today's launches" | "See what's trending" |
| `index.astro:93-96` | "Launching something? Verify your domain…" / "List your product" | Makers block (post-launch or founding-maker version) |
| `c/[slug].astro:44-46` | H1 = category name, intro = category description | "New [Category] apps worth trying — this week" plus the template intro |
| `c/[slug].astro:59` | Section heading "Newest first" | Top this week is the default view |
| `c/[slug].astro:79` | "See all N products in X" / "…unlocks the full list…" | "You've seen this week's top [category] picks…" |
| `ProductRow.astro:43`, `ProductTile.astro:25` | Card badge "Member perk" | No card perk badge in COPY ("Has a perk" is a filter label) |
| `ProductLayout.astro:97-98` | "Member perks" / "Free account required" | "Only on Tryworthy" / "Sign in to claim this perk" |
| `p/[slug]/index.astro:30` | "Tell the maker what you think" | "Tell the maker what would make this a must-have." |
| `format.ts:3` | Stage label "Beta" | "Pre-launch — try it before everyone else" (D3) |
| `Onboarding.tsx:16-20` | Daily / Weekly / Off | Daily · Weekly (recommended) · Only in the app (D11) |
| `api/lib/notify.ts:19` | "N new products in your categories" | "Top 5 new in [Category] this week" |
| `Footer.astro:11`, `Base.astro:24,33` | Old tagline, default description and title | SEO templates (§5) |

Strings that have no COPY source and would have to be invented under a literal rule (D10) include: `feed.astro:27-28` ("New for you, {name}"), the onboarding push step (`Onboarding.tsx:59-60`), every empty state (for example `index.astro:68` "It takes about three minutes."), the `dashboard/*` onboarding text, auth forms, settings, admin, API error messages (`api/routes/*.ts`) and emails (`api/auth.ts`).

---

## 3. RANKING.md

### Exists
| What | Where |
| --- | --- |
| Save, once per user per product | `db` `saves` PK `(user_id, product_id)`; `api/routes/me.ts:177` |
| Perk claim, once per user per perk | `db` `perk_claims` PK `(perk_id, user_id)`; `api/routes/interact.ts:36` |
| Roadmap vote, once per item | `db` `roadmap_votes` PK `(item_id, user_id)`; `interact.ts:333` |
| Feedback | `db` `feedback`; `interact.ts:173` (minimum length 1, no 30-character rule) |
| Outbound click endpoint | `api/routes/public.ts:287` `POST /products/:id/click` |
| Eligibility precedent: confirmed email plus account age | Reports: `interact.ts:395-397`, `REPORT_MIN_ACCOUNT_AGE_DAYS = 7` |
| Maker can't act on own product | Feedback `interact.ts:178`, reports `interact.ts:379` |
| Valid-report count and penalty source | `products.valid_report_count`, `reports.counts`, `reports.outcome` |
| Scheduled jobs | `api/index.ts` `scheduled()`, `apps/api/wrangler.jsonc` crons |
| SSRF-safe fetcher with a 5 s default timeout (for "link responds") | `api/lib/fetcher.ts:44` |
| Admin review queue (where spike cases can go) | `api/routes/admin.ts:30` `/admin/review-queue`, `web/islands/Admin.tsx` |
| Pricing and has-perk filters (search only) | `public.ts:184` `/search`, `api/lib/products.ts` `perkAvailableSql` |
| No payment data that could affect order | Nothing in `db` |

### Missing
- `products` columns: `has_ai`, `platforms`, `staff_pick_at`, `staff_pick_note`, `score_week`, `score_trending`, `quality_ok`, `ranked_at`.
- Tables `product_signals` and `product_signal_daily`.
- `packages/shared/src/ranking/config.ts`.
- A 30-minute aggregate and score job.
- Top and Trending queries. **Every list sorts by `published_at DESC`:** `public.ts` `/categories/:slug/products`, `/products`, `/home`, `/feed`, `/search` (when there's no query).
- The just-launched slot, staff picks in admin, the spike check, the quality checklist in the maker dashboard, and `/ranking`.
- AI and platform filters, and any filters on category pages or the feed.
- "Includes AI features" and platform checkboxes in `web/islands/ProductForm.tsx`.

### Conflicts
- **Makers' own activity counts today.** This breaks the new CLAUDE.md rule now, not only later:
  - `PUT /me/saves/:productId` (`me.ts:177`) has no maker check, so a maker's own save raises `save_count`.
  - Roadmap votes (`interact.ts:325` `votableItem`) and perk claims (`interact.ts:36`) have no maker check.
  - Views and clicks are anonymous and include the maker.
  - **The digest already ranks by these counters:** `api/jobs/digest.ts:57` uses `ORDER BY save_count, view_count`.
- **Clicks have no user.** `/products/:id/click` is anonymous, and counts are summed in isolate memory and can be lost (`api/lib/counters.ts`). "Once per day per user per product" needs the session user, and the signal has to be a D1 insert, not an in-memory counter. Visitor clicks can't be signals.
- **Cron budget.** The free plan allows 5 Cron Triggers and 4 are used (`apps/api/wrangler.jsonc:41`: digest at 08:00, 08:20, 08:40 and maintenance at 03:00). The 30-minute job takes the last slot, so step 13's retention job has to run inside the 03:00 job.
- **Domain-owner rule.** `domains.hostname` is UNIQUE, so each hostname has a single owner. "Accounts that own the product's domain" therefore means the owner of `products.domain_id`, plus owners of parent or child hostnames (`packages/shared/src/verification.ts` `domainCandidates`).
- **"Description ≥ 80 characters".** The description is limited Markdown, so length has to be measured on `markdownToText`, not on the raw string.
- **Report penalty vs. auto-hide.** −10 per valid report coexists with auto-hide at 3 (`REPORT_HIDE_THRESHOLD`). Restoring a product resets `valid_report_count` to 0 (`admin.ts:97`), which also drops the penalty. That is consistent, but it should be documented.
- **Two account-age thresholds** (3 days for signals, 7 for reports). Both should live in one config.
- **Products with feedback off** (`feedback_mode = 'off'`) can never earn the feedback signal (weight 3). This is a fairness note, not a bug.
- The stage and platform enums depend on D3 and D4.

---

## 4. PRELAUNCH.md

### Exists
| What | Where |
| --- | --- |
| "Reservation = normal account": signup plus interests, with no waitlist to migrate | `web/islands/AuthForm.tsx`, `web/pages/onboarding.astro`, `me.ts:107` `PUT /me/interests` |
| Makers can verify and publish, and product pages are live and indexable | `maker.ts`, `web/pages/p/[slug]/index.astro` |
| Fan-out for a one-time notification to every user | `api/lib/notify.ts` `createNotifications`, `pushToUsers`; batching pattern in `jobs/digest.ts` |
| Live product count per category | `public.ts:41` `categoryList` (counts every live product, not eligible ones) |
| Admin panel to extend | `web/pages/admin.astro`, `web/islands/Admin.tsx` (tabs: queue, users, categories, blocked) |
| Signed-in visitors on `/` are sent to `/feed` | `web/layouts/Base.astro:62` |

### Missing
- The `PRELAUNCH` flag. It's in neither `api/env.ts` nor `web/lib/config.ts`.
- The pre-launch hero, "Your feed opens on launch day" on `/feed`, `founding_maker_at` plus a configurable N, hiding and noindexing categories with fewer than 3 eligible products, the reserved-feed counter with its threshold, UTM first-touch fields on `user` (none exist) and their capture, the admin stats card, and the Launch action.

### Conflicts
- **Where the flag lives** (D6). Public pages are also cached at the edge for 60 s to 5 min, tagged `home`, `c:*`, `p:*` (`index.astro:15`, `c/[slug].astro:25`). Flipping the flag needs a purge of those tags as well.
- **"Hide from navigation" needs a scope.** Categories appear in the home grid (`index.astro:113`), the category strip (`c/[slug].astro:50`), onboarding chips, settings interests and the product form. Onboarding and the product form must still list every category, or users can't reserve interests and makers can't publish into empty ones.
- **Order of steps.** "Eligible" depends on `quality_ok`, so the 6-product home block, the 3-product category rule and the launch criteria all need step 3 done before step 5.
- **UTM storage before signup.** Use sessionStorage, not a cookie, so the cookie list stays essential-only (§6).

---

## 5. SEO.md

### Exists
| What | Where |
| --- | --- |
| Indexable product, category and maker pages, server-rendered and edge-cached | `web/pages/p/[slug]/index.astro`, `c/[slug].astro`, `m/[username].astro` |
| Title, description, canonical (path without query by default), noindex, `og:*`, `twitter:card` | `web/layouts/Base.astro:33-53` |
| Home JSON-LD: `WebSite` plus `SearchAction` | `index.astro:26-32` |
| Product JSON-LD: `SoftwareApplication`, with no `AggregateRating` | `web/layouts/ProductLayout.astro:23-35` |
| HTML breadcrumbs (no JSON-LD) | `ProductLayout.astro:40-44`, `c/[slug].astro:38` |
| `robots.txt` | `web/pages/robots.txt.ts` |
| `sitemap.xml` (one file, cached 1 h) | `web/pages/sitemap.xml.ts`, `public.ts:316` `/sitemap` |
| Search is noindex when it has a query or filters, with canonical `/search` | `web/pages/search.astro:40` |
| WebP images up to 1600 px, `<img>` with width and height (falls back to 1600×1000) | `api/lib/images.ts`, `web/components/ProductImage.astro:17` |
| Static OG fallback image | `apps/web/public/og.png` |

### Missing
- Every title and meta template, plus truncation at 60 and 155 characters.
- Pages: `/new`, `/top`, `/trending`, a public `/perks`, `/makers`, `/ranking`, `/c/[slug]/week/[yyyy-ww]`, the articles.
- `Organization` on home, `CollectionPage` + `ItemList` + `BreadcrumbList` on categories, `BreadcrumbList` on products.
- A split sitemap (index → products, categories, makers, weekly archives) and **regeneration on publish**. The sitemap is cached under the tag `sitemap`, but the API never purges that tag (`api/lib/cache.ts` `tagsForPaths` only knows `home`, `p:`, `c:`, `m:`).
- A generated OG image per product.
- HTTP 410 for removed products.

### Conflicts
- **`/perks` is private today.** It's the "Your perks" page (`web/pages/perks.astro`) and robots blocks it. SEO wants `/perks` public and `/perks/claimed` blocked. Links to update when it moves: `Header.astro:121` and the toast in `web/scripts/product.ts:85`.
- **`/search`** isn't disallowed in robots but SEO requires it to be. It's also listed in the sitemap (`sitemap.xml.ts:19`), so it has to come out of the sitemap too.
- **`/api` in robots.** The API runs on the `api.` subdomain, so the site's robots.txt has no effect on it. The API worker needs its own `robots.txt` with `Disallow: /`.
- **Hidden and removed products return 404 today** (`p/[slug]/index.astro:11` rewrites to `/404`). SEO wants 410 (D9).
- **Product JSON-LD is partly wrong** (`ProductLayout.astro:28-34`):
  - `offers` is always emitted, and for `paid` products it has no `price`, which makes the Offer invalid.
  - `operatingSystem` is hard-coded to "Web".
  - `description` is the tagline.
- **Titles today vs. the templates:**
  - Category: "New X products · ToolMarket".
  - Maker: "Name (@username) · ToolMarket".
  - Product: `${title}: ${tagline}` with no truncation. Title (80) plus tagline (60) can exceed 60 characters.
- **The AI landing page** (D5).
- **Route layout.** `/c/[slug]/week/...` means moving `web/pages/c/[slug].astro` to `c/[slug]/index.astro`.

---

## 6. LEGAL.md

### Exists
| What | Where |
| --- | --- |
| Essential-only storage: the Better Auth session cookie (httpOnly, lax, 30 days); the `tm_auth` hint cookie (30 days, readable, no secret); a sessionStorage saved-ids cache. **No analytics and no third-party trackers found.** | `api/auth.ts:72-79`, `api/app.ts:15-31`, `web/scripts/global.ts:9-30` |
| Third parties to list: Cloudflare (Workers, D1, R2, Images, Browser Rendering, Turnstile), Google sign-in, Resend (email), browser push services | `api/auth.ts`, `api/lib/email.ts`, `api/lib/webpush.ts`, `api/lib/screenshot.ts` |
| Report flow for signed-in users only: Turnstile, auto-hide, admin restore and remove | `interact.ts:372`, `admin.ts:86,121` |
| A notification to the maker on admin removal | `admin.ts:131-133` (generic text) |
| Retention: expired sessions and verification tokens, read notifications older than 90 days | `api/jobs/maintenance.ts:20-27` |
| A public homepage that describes the app, reachable without login (Google OAuth check) | `web/pages/index.astro` |

### Missing
- All 7 pages: `/terms`, `/privacy`, `/cookies`, `/guidelines`, `/terms/makers`, `/report`, `/legal`. `apps/web/src/content/` doesn't exist.
- Footer links. `Footer.astro` only has Explore, Categories, Submit a product, Sitemap and ©.
- Signup consent text, the age checkbox, and `terms_version` / `accepted_at` on `user`.
- **Account deletion and data export.** There are no endpoints in `me.ts`. Settings has only Profile, Categories, Digest and Account (password) (`web/islands/Settings.tsx`).
- A public report form, `moderation_decisions`, contesting a decision, and statements of reasons.
- **When reports auto-hide a product, the maker gets no message at all** (`interact.ts:401-409`).

### Conflicts
- **The `reports` schema blocks public reports.** `reporter_id` is NOT NULL and `product_id` is a NOT NULL FK. There's also `UNIQUE(product_id, reporter_id)`. Making the columns nullable means rebuilding the table in SQLite. A DSA report can also target things that aren't products (feedback text, a maker profile, any URL).
- **The report reasons don't match.** Today: `spam, scam, dead_link, prohibited, other` (`packages/shared/src/enums.ts`). DSA form (step 14): illegal content, intellectual property, scam/fraud, malware, other. Step 14 says the signed-in flow stays unchanged, so this means two enums or a merged one.
- **Account deletion collides with the foreign keys:**
  - `products.maker_id` references `user` with no `ON DELETE`, so deleting a maker fails until their products are gone.
  - `feedback.user_id` is `ON DELETE CASCADE`, so deleting a user *deletes* their public feedback. LEGAL wants it kept and anonymized ("Deleted user"). That needs a nullable `user_id` or a tombstone user, which means a migration.
  - `reports.reporter_id` also cascades, which erases moderation history.
- **Data to declare in the Privacy Policy:**
  - `session.ip_address` and `session.user_agent` are stored (`db` `session`).
  - Turnstile processes the visitor's IP.
  - Screenshots are taken of makers' sites.
- **`tm_auth`** is a readable functional cookie that lasts 30 days. It must appear on `/cookies`. Whether it counts as "strictly necessary" is a question for the lawyer, though the risk is low.
- **Footer year.** The footer prints the year dynamically; the docs say "© 2026 [Operator]". This is cosmetic.

---

## Not split from the pack

These parts of `docs/positioning-pack.md` were not assigned to any of the six files, so they exist only in the pack: the 16 step prompts, "Decizii deschise", the lawyer checklist and the sources list.
