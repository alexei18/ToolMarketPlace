# ToolMarketPlace — SEO

> Extracted verbatim from `docs/positioning-pack.md` (Oct 27, 2026 · @Alexei).

## SEO

Strategia: fiecare categorie și fiecare produs devin pagini indexabile, iar title-urile combină prospețimea (new, this week, trending) cu calitatea (worth trying, best new). Platforma e generală, așa că ținta sunt căutările despre aplicații noi în general și despre aplicații AI în special. Volumele de căutare nu sunt verificate aici; le validezi în Google Search Console și Keyword Planner.

**Clustere de cuvinte cheie**

| Cluster | Exemple | Pagina țintă |
| --- | --- | --- |
| Descoperire generală | new apps, best new apps this week, new apps to try | Homepage, `/new`, `/top` |
| AI | new AI tools, AI-powered apps, new AI apps this week | `/top?ai=1`, categorii cu filtrul AI |
| Tendințe | trending apps, trending AI tools | `/trending` |
| Pe categorie | best new productivity apps, new design tools | `/c/[categorie]` |
| Pe produs | \[Product\] review, \[Product\] alternatives, \[Product\] free trial | `/p/[slug]` |
| Pe ofertă | app free trial, app discount code, AI tool coupon | `/perks` |
| Makeri | where to launch my app, get beta testers for my app | `/makers` (pagină pentru makeri) |

**Șabloane title și meta description**

| Pagină | Title (≤ 60 caractere) | Meta description (≤ 155 caractere) |
| --- | --- | --- |
| Homepage | New Apps & AI Tools Worth Trying · ToolMarketPlace | Find the new apps worth trying before everyone else. Ranked by real people, with early access and perks you can't get anywhere else. Free. |
| Categorie | Best New \[Category\] Apps This Week · ToolMarketPlace | New \[category\] apps and AI tools, ranked by what real people save and try. Updated daily, with free trials and perks. |
| Top / Trending | Top New Apps This Week · ToolMarketPlace | This week's best new apps and AI tools, ranked by saves, tries and feedback from verified users. No paid rankings. |
| Produs | \[Product\]: \[tagline\] · ToolMarketPlace | \[Short description, \~120 chars\]. \[Perk if any, e.g. "60 days free on ToolMarketPlace."\] |
| Profil maker | \[Maker name\] — Products on ToolMarketPlace | New apps built by \[maker name\], verified on ToolMarketPlace. |
| Perks | App Deals, Free Trials and Coupons · ToolMarketPlace | Exclusive free trials, discounts and coupons from the makers of new apps and AI tools. Free account required to claim. |

În pre-lansare, categoriile cu mai puțin de 3 produse eligibile primesc noindex și nu apar în sitemap.

**Date structurate (JSON-LD)**

- Homepage: `Organization` + `WebSite` cu `SearchAction` (căutarea internă).
- Categorie: `CollectionPage` + `ItemList` cu produsele afișate + `BreadcrumbList`.
- Produs: `SoftwareApplication` (name, description, applicationCategory, operatingSystem: Web, url, image, offers dacă are preț sau perk) + `BreadcrumbList`.
- Fără `AggregateRating` până nu avem ratinguri reale — rating-uri inventate atrag penalizări.

**SEO tehnic**

- Un singur H1 per pagină; URL-uri canonice (`<link rel="canonical">`), fără parametri de filtrare indexați.
- `sitemap.xml` împărțit: produse, categorii, makeri; regenerat la publicare.
- `robots.txt`: blochează `/dashboard`, `/admin`, `/settings`, `/saved`, `/perks/claimed`, `/search`.
- Open Graph + Twitter card pe fiecare pagină; imagine OG generată automat pentru produse (imaginea produsului + numele + logo).
- Paginile de produs ascunse sau șterse returnează 410, nu 404.
- Viteză: țintă LCP sub 2,5 s pe mobil; imagini WebP cu `width`/`height`.
- `hreflang` doar când adăugați alte limbi.

**Conținut care susține poziționarea**

- Pagini publice `/new`, `/top` și `/trending`, pe toate categoriile.
- Arhivă săptămânală pe categorie (`/c/[categorie]/week/2026-44`) cu top-ul acelei săptămâni, construită automat din digest.
- Pagina `/makers` pentru partea de makeri: de ce să-și listeze produsul, cum funcționează clasamentul, perks și testarea înainte de lansare.
- Pagina `/ranking`, care explică regulile clasamentului și construiește încredere.
- 3–5 articole de fond: „How we rank new apps (and why nobody can pay to move up)”, „Where to find new apps before they go viral”, „How to get your first 100 users for a vibe-coded app”.
