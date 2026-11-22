# Analytics (PostHog)

PostHog rulează pe fiecare pagină (`layouts/Base.astro` → `scripts/analytics.ts` → `lib/analytics.ts`), **fără cookie-uri** (`cookieless_mode: "always"`). Nimic nu se salvează în browser, deci tot nu avem banner (`/cookies`, `/privacy#site-usage-statistics`). Proiectul PostHog: „Tryworthy” (759174) pe PostHog Cloud US (`us.i.posthog.com`); transferul e acoperit în `/privacy#international-transfers`.

## Config

| Var (wrangler.jsonc, `apps/web`) | Ce e |
| --- | --- |
| `POSTHOG_KEY` | Tokenul public al proiectului (`phc_…`). Gol = analytics oprit. |
| `POSTHOG_HOST` | `https://us.i.posthog.com`, sau subdomeniul reverse proxy-ului gestionat de PostHog după ce există CNAME-ul. |

Reverse proxy gestionat (creat în PostHog, organizația OnesDev): `e.tryworthy.app`, CNAME către `0c2c74eeca594c4693ac.cf-prod-us-proxy.proxyhog.com` (DNS only, nor gri în Cloudflare). Când PostHog îl arată „live”, `POSTHOG_HOST` devine `https://e.tryworthy.app`.

În proiectul PostHog trebuie să fie pornit **Settings → Project → Web analytics → Cookieless tracking**. Fără el, PostHog aruncă toate evenimentele.

## Ce pierdem fără cookie-uri

- Un vizitator e „același” doar într-o zi (hash-ul din IP + browser se schimbă zilnic), deci retenția pe zile și „returning visitors” nu înseamnă nimic.
- Nu avem session replay, `identify` sau persoane. Nu legăm niciodată un vizitator de emailul lui.
- Țara nu apare (PostHog nu păstrează IP-ul în modul ăsta).

## Evenimente

Automate: `$pageview`, `$pageleave`, `$autocapture` (clicuri pe butoane și linkuri), `$web_vitals`, `$exception`. Pe toate evenimentele: `signed_in` (true = maker invitat sau admin).

| Eveniment | Unde | Proprietăți |
| --- | --- | --- |
| `waitlist_joined` | formularul de pe `/`, după ce API-ul răspunde OK | `role` (explorer/maker), `interests_count`, `has_product_url`, `found_via`, `referred` |
| `waitlist_failed` | formularul de pe `/`, la eroare | `role`, `code` (VALIDATION, RATE_LIMITED, NETWORK, …) |
| `waitlist_confirmed` | `/waitlist/confirm`, când linkul din email e valid | `role`, `referrals`. Doar linkuri vechi: din 2026-11-22 nu se mai trimit emailuri de confirmare. |
| `waitlist_share_copied` | `/` după înscriere și `/waitlist/confirm`, butonul Copy | `role` |

Reguli: fără email, URL de produs sau alt text scris de utilizator în proprietăți. Tokenurile din linkuri (`?t=`, `?token=`) sunt înlocuite cu `redacted` în `before_send` (`lib/analytics.test.ts`).

## Cine e sursa adevărului

- **Baza de date** (admin `/admin/waitlist`, export, foaia Signups din `marketing/tiktok-tracker.xlsx`): câți oameni s-au înscris și confirmat, pe rol, `utm_*`, `found_via`, referali. Orice număr afișat pe site vine de aici (CLAUDE.md).
- **PostHog**: ce se întâmplă *înainte* de înscriere. Câți vizitatori, de unde, ce rată de conversie, unde pleacă, cât de repede se încarcă pagina pe mobil, ce erori JS apar.

Dacă cele două diferă la numărul de înscrieri, câștigă baza de date. PostHog pierde pe cei cu ad-blocker până la reverse proxy.

## Ce urmărim în prelaunch

1. **Vizitatori unici pe zi și sursa** (`utm_source`/`utm_campaign`, referrer): linkul din bio TikTok aduce oameni?
2. **Conversia vizită → `waitlist_joined`** pe `/`, defalcată pe sursă și pe varianta de titlu (`?h=b` față de A în `$current_url`). Asta e metrica principală a landing-ului.
3. **Join → confirm**: din DB (confirmed_at). În PostHog doar orientativ, pentru că confirmarea poate veni în altă zi.
4. **Explorer vs maker** în `waitlist_joined.role`. Ținta: destui makeri cât să existe produse la lansare.
5. **Bucla de share**: `waitlist_share_copied` și vizitele cu `?ref=` → `waitlist_joined` cu `referred = true`.
6. **Erori**: `waitlist_failed` după `code`, `$exception`. Orice creștere înseamnă oameni pierduți.
7. **Viteză pe mobil**: LCP/INP pe `/` (traficul TikTok vine din browserul din aplicație).

Excludem din analiză: `signed_in = true` (noi și makerii invitați) și host-urile locale (filtrul „test accounts” din proiect).

## Rutina

- **Zilnic, în campanie:** dashboard-ul „Prelaunch – waitlist”: vizitatori, înscrieri, conversie pe sursă, erori.
- **La D1/D5/D10 după fiecare video** (docs/tiktok-campaign.md): vizitele din bio din zilele respective, puse lângă Metrics din Excel. Atribuirea pe video nu e exactă (un singur link în bio), deci comparăm zile, nu videouri.
- **Săptămânal:** ce pagină sau sursă a convertit cel mai bine → o observație în foaia Learnings.
