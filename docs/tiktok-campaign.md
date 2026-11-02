# Tryworthy — waitlist și campania video TikTok

Nov 1, 2026 · @Alexei

## Planul pe scurt

Pagina de waitlist trebuie să fie live înainte de primul video: fără ea, traficul adus de TikTok se pierde. Apoi o buclă zilnică: 5 video postate, date după o zi, analiză, alte 5 video construite pe primele 2 care au mers cel mai bine.

1. **Waitlist live** — o casetă de email pentru utilizatori și una pentru makeri; makerii primesc acces cu o săptămână înainte de lansare ca să-și publice produsele.
2. **Pipeline video, o singură dată** — proiect Remotion în repo, cu brandul, logo-ul pentru endscreen, vocea fără pauze și interfața copiată 1:1 din codul aplicației.
3. **Batch 1, pentru mâine** — 5 video diferite ca mesaj, abordare, stil și animație, plus Excel-ul cu tot ce trebuie pentru postare.
4. **Postare și extragere date** — automatizate cu UiPath; discutăm separat, după primul batch.
5. **Zilnic** — datele de după o zi intră în Excel, Claude Code analizează și face batch-ul următor. La 5 și 10 zile, analiză pe termen lung.

&#91;embedded content: bucla zilnică · Claude Code și UiPath\]

Claude Code face și analizează video-urile, UiPath le postează și aduce datele; snapshot-urile de ziua precedenta si la 5 și 10 zile corectează alegerile făcute după prima zi.

**Limita atribuirii.** Descrierile TikTok nu au linkuri clickabile; singurul link e cel din bio, iar adăugarea lui poate cere cont business sau un număr minim de urmăritori (verifică în aplicație). Deci nu putem ști exact ce video a adus fiecare înscriere. Măsurăm două lucruri separat: performanța fiecărui video în TikTok (vizualizări, vizionare completă, share-uri, salvări) și înscrierile pe zi venite din linkul din bio. Pe waitlist adăugăm și o întrebare opțională „Where did you find us?”.

## Pagina de waitlist

Waitlist-ul înlocuiește pasul „Reserve your feed” din modul de pre-lansare: în loc de cont complet, doar un email. E mai rapid pentru cineva venit din TikTok pe telefon, deci convertește mai bine.

|  | Utilizator (explorer) | Maker |
| --- | --- | --- |
| Ce completează | Email; opțional 3+ categorii de interes | Email; opțional link-ul produsului și categoria |
| Ce primește | Invitație în ziua lansării, cu primul top din categoriile alese | Acces cu 7 zile înainte de lansare: cont, verificare domeniu, publicare; badge „Founding maker” |
| Mesajul principal | „Be first to find the new apps worth trying.” | „Launch where people actually try new apps. Makers get in a week early.” |

**Reguli care contează**

- **Double opt-in:** emailul intră în listă doar după confirmare. E dovada consimțământului (GDPR, Legea 195/2024) și ține lista curată.
- **Mobil întâi:** aproape tot traficul vine din browserul din aplicația TikTok. Formularul e vizibil fără scroll la 390 px, pagina e ușoară, fără pop-up-uri.
- **Contoare reale:** „\[N\] people are waiting” apare doar peste un prag, cu N citit din baza de date.
- **Share după confirmare:** fiecare persoană primește un link personal; pagina arată câți prieteni s-au înscris prin el. Fără locuri în coadă, ca să nu complicăm.
- **În săptămâna makerilor**, publicul vede tot waitlist-ul; produsele publicate stau ascunse și cu noindex până în ziua lansării, ca toată lumea să găsească atunci un catalog plin.

**Prompt Claude Code (plan mode)**

```text
Replace the pre-launch "Reserve your feed" account flow with a simple email waitlist. Read docs/PRELAUNCH.md, docs/COPY.md and the current homepage first, then plan.

1. Mode: a WAITLIST flag (on in production now) makes the homepage the waitlist page. All other public routes redirect to it, except legal pages, /ranking, /about and /makers. Invited makers can still log in and use /dashboard.
2. Page: hero with the Tryworthy wordmark from /brand, H1 "Find the new apps worth trying — before everyone else.", a two-option toggle "I want to discover apps" / "I build apps", one email field and one button. Explorer option: optional category chips (pick up to 5 of the 20). Maker option: optional product URL and category. Below the fold: 3 short blocks (how ranking works, perks and pre-launch access, makers get in a week early) and an FAQ. Copy follows docs/POSITIONING.md; add every new string to packages/shared/src/copy. Mobile first: at 390x844 the form is fully visible without scrolling. No pop-ups, no autoplay, page weight under 200 KB excluding the logo.
3. Data: D1 table waitlist (id, email unique lowercased, role 'explorer'|'maker', interests JSON, product_url, utm_source, utm_medium, utm_campaign, utm_content, found_via (optional dropdown: TikTok, Instagram, X, a friend, search, other), ref_code unique, referred_by, confirmed_at, invited_at, unsubscribed_at, created_at). Capture UTM params from the landing URL into sessionStorage and send them with the form. Store no IP address.
4. Flow: Turnstile + rate limit per IP → create a pending row → confirmation email with a signed, expiring link → confirmed page with what happens next (makers: "You get access on [MAKER_ACCESS_DATE]"), their personal share link (tryworthy.app/?ref=CODE), and how many people joined through it. Same email submitted twice → resend confirmation, never a duplicate. Unconfirmed rows are deleted after 7 days.
5. Emails (use the transactional provider already in the repo; if none, propose Resend): confirmation, maker early-access invite with a magic link to create the account, launch invite for explorers. Every email has the wordmark, a plain-text version and a one-click unsubscribe link.
6. Admin /admin/waitlist: confirmed signups per day split by role and utm_campaign, found_via breakdown, top referrers, CSV export, and two actions with a confirmation step: "Invite makers" (sends the early-access invite to all confirmed makers) and "Launch" (turns WAITLIST off and sends explorers the launch invite with the top picks in their categories).
7. Counter "[N] people are waiting" renders only when N ≥ a config threshold (default 300), N from the database.
8. Legal: under the button "By joining you agree to our Privacy Policy" with a link; update /privacy with the waitlist data, purpose, retention (delete waitlist data 6 months after launch if the person never creates an account) and the email provider as a processor.
9. SEO and sharing: title and meta from docs/SEO.md adapted to the waitlist, OG image with the wordmark, canonical https://tryworthy.app.
10. Tests: double signup, invalid email, expired confirmation link, unsubscribe, UTM and ref capture, counter threshold.
Show me the plan and the D1 migration first. Add MAKER_ACCESS_DATE and LAUNCH_DATE to config with placeholders.
```

## Cele 5 concepte din primul batch

Fiecare video diferă pe toate axele: public, mesaj, tipul de hook, stil vizual și animație. Așa aflăm din prima zi ce direcție merită dezvoltată. Toate durează 25–35 de secunde, folosesc aceeași voce și se termină cu endscreen-ul cu logo și „Join the waitlist — link in bio”.

| ID | Public | Mesaj | Abordare / hook | Stil vizual | Animație |
| --- | --- | --- | --- | --- | --- |
| TW-B01-V1 · Buried | Ambii | Aplicațiile bune se pierd în zgomot | Mini-poveste: un maker lansează și nu-l vede nimeni. Hook: „Someone built the app you've been looking for. You'll never see it.” | Întunecat, cinematic; un singur card de aplicație e „personajul” | Mișcări lente de cameră, o singură lumină care trece peste card |
| TW-B01-V2 · Before it trends | Exploratori, creatori | Afli de aplicații înainte să devină virale | POV + demo. Hook: „Every app that went viral was on someone's screen first. Here's how to be that someone.” | Interfața Tryworthy reală (Trending, feed) într-un telefon | Tăieturi rapide, zoom pe tap-uri, cursor |
| TW-B01-V3 · Launch here first | Makeri | Primii utilizatori pentru ce ai construit; o săptămână mai devreme | Vorbit direct către maker. Hook: „Built something with AI this weekend? Nobody's going to find it. Unless…” | Alb, editorial, tipografie mare în culorile brandului | Text care se scrie singur; bife care se desenează, din motivul logo-ului |
| TW-B01-V4 · Votes can't buy this | Ambii | Clasament după semnale reale; nimeni nu plătește ca să urce | Hot take. Hook: „Hot take: launch leaderboards are a popularity contest.” Fără să numim vreun concurent | Contrast mare negru–verde, text uriaș, stil meme curat | Tăieturi tari, text care „cade” pe ecran pe ritmul vocii |
| TW-B01-V5 · Perks only here | Exploratori | Oferte și acces devreme pe care nu le găsești altundeva | Curiozitate + dezvăluire. Hook: „What if new apps gave you a free month just for trying them first?” | Pagina de produs Tryworthy reală; cardul de perk e eroul | Arcuri line (spring), cardul se întoarce și dezvăluie oferta |

Toate aplicațiile arătate în video sunt fictive și se marchează discret „illustrative”, pentru că platforma nu are încă produse reale. Nu apar cifre inventate (utilizatori, aplicații, procente).

## Vocea fără pauze și sincronizarea

Regula care rezolvă ambele probleme: vocea e ceasul video-ului. Animațiile nu au durate fixe; fiecare element apare pe cuvântul lui, citit din timpii exacți ai vocii.

**De unde veneau pauzele și desincronizarea**

- Vocea era generată propoziție cu propoziție și lipită cu spații fixe între bucăți.
- Scenele aveau durate fixe, scrise dinainte, iar vocea doar „cădea” peste ele.
- Textul pentru voce avea puncte, „…”, liniuțe și rânduri noi, pe care sinteza vocală le citește ca pauze lungi.
- Ritmul vocii era prea lent pentru TikTok.

**Pipeline-ul nou**

1. **Script scris pentru voce:** propoziții de 6–14 cuvinte, legate prin virgulă sau „and”; fără „…”, fără liniuțe lungi, fără rânduri noi; numerele scrise în litere. Ritm țintă: 2,7–3 cuvinte pe secundă, deci un video de 30 s are cam 80 de cuvinte.
2. **O singură înregistrare continuă pe video**, niciodată bucăți separate lipite.
3. **Curățare automată (ffmpeg):** se taie liniștea de la început și sfârșit, orice pauză din interior mai lungă de 0,25 s se scurtează la 0,15–0,2 s, volumul se aduce la -14 LUFS. Dacă vocea e tot lentă, se accelerează cu 5–10% fără să se schimbe tonul.
4. **Aliniere la nivel de cuvânt:** Whisper (prin `@remotion/install-whisper-cpp`) dă momentul exact de început și sfârșit al fiecărui cuvânt, salvat în `words.json`.
5. **Montajul pe cuvinte:** fiecare scenă are un „cuvânt-cue”; ea începe pe cadrul acelui cuvânt. Durata totală = sfârșitul vocii + 2 s de endscreen. Subtitrările vin din același `words.json`, deci sunt sincronizate perfect.
6. **Control automat înainte de render:** raport cu orice pauză peste 0,35 s, primul cuvânt după mai mult de 0,3 s și orice element care apare la mai mult de 3 cadre distanță de cuvântul lui. Video-ul nu se randează până nu trece.

**Trei surse de voce, același pipeline de la pasul 3**

| Sursă | Cum funcționează | Calitate |
| --- | --- | --- |
| Tu, în Google AI Studio (Gemini TTS) | Claude Code îți dă pentru fiecare video `vo/<ID>.txt` cu textul și instrucțiunea de stil; tu salvezi vocea ca `vo/<ID>.wav`, apoi Claude Code continuă | Foarte naturală; recomandat pentru început |
| Claude Code, cu ElevenLabs | Generează direct prin API, cu cheia ta | Foarte naturală; complet automat |
| Claude Code, cu Kokoro local | Gratuit, fără cheie | Mai robotică; doar pentru teste |

Instrucțiunea de stil pentru AI Studio, aceeași pentru toate video-urile ca vocea să fie constantă: *„Read this like a friendly tech creator on TikTok: upbeat, quick and conversational, natural rhythm, no long pauses between sentences.”* Alege o singură voce și păstreaz-o în tot primul batch, ca vocea să nu fie o variabilă în test.

## Prompt: setup Remotion (o singură dată)

Proiectul video trăiește în același repo, în `apps/videos`, ca să poată folosi direct culorile, fonturile, logo-ul și chiar componentele React ale aplicației. Rulează-l în plan mode. Remotion e gratuit pentru persoane fizice și firme mici; verifică licența pe site-ul lor dacă deschizi o firmă mai mare.

```text
Set up a Remotion project for Tryworthy TikTok videos in apps/videos inside this monorepo. Read docs/POSITIONING.md, docs/COPY.md, the design tokens in packages/shared and the logo files in brand/tryworthy-logo/ first. If an art-director / video-creator skill is installed (e.g. video-creator), load it and use it for concept, story beats and copy; Remotion is the rendering engine.

1. Format: 1080x1920, 30 fps, H.264 MP4, AAC audio. Layout: center every element on the frame center x = 540, never on the safe-zone center. Critical text and the UI being talked about stay inside x 180–900 (720 px, symmetric around 540) and y 260–1420; decorative parts (phone bezel, shadows) may reach x 100–980; nothing important in the bottom 500 px. A debug overlay (off in renders) shows these zones plus the center line, and vo-check fails if a scene's main element is more than 8 px off x = 540.
2. Brand: import colors and fonts from packages/shared (ink #111111, accent #0E7A4F, accent on dark #3CCB8A, Inter and Inter Tight loaded locally). Endscreen component: the outlined wordmark SVG from brand/tryworthy-logo/ (never rebuilt from text), "Join the waitlist", "link in bio", 2.0 s, light and dark variants. Never redraw or recolor the logo.
3. App UI, 1:1 with the real product: before any scene shows a page of the app, open that page's route and components in apps/web and match them exactly. Prefer, in this order: (a) import the real React component into Remotion with demo data; (b) capture the real page with Playwright from a separate local stack whose own D1 database (never the dev database) holds a deterministic demo seed in apps/videos/seed: 16 fictional products across at least 8 categories, clean names, real-sounding taglines, simple generated thumbnails in neutral styles, a few perks and pre-launch badges, no real brand names anywhere and no numbers shown in captures (device scale 2) and animate the capture (pan, zoom, highlights, an animated cursor on top); (c) only if neither works, rebuild it from the component source with the same tokens, spacing and copy. PhoneFrame: the bezel never scales; the phone is at most 640 px wide, centered at x 540, fully inside y 200–1500, and zoom and pan happen inside the screen (the capture moves, the frame stays). For detail beats, cut to a CardCrop scene: the real capture of the one card or row the voice is talking about, at device scale 2, about 720 px wide, centered. Minimum text size in any UI shot: 32 px for secondary text and 40 px for names at 1080 width; vo-check fails below that for the UI being talked about. Keep a side-by-side check image (real page vs video frame) for every UI scene in out/checks/. Demo products are fictional, marked "illustrative" in small text, and never show invented user counts or ratings.
4. Voice pipeline (the voice is the clock):
   - vo/<ID>.txt = the exact narration + the style instruction for Google AI Studio; vo/<ID>.wav = the recorded voice (I may provide it, or generate it with ElevenLabs if ELEVENLABS_API_KEY is set; Kokoro only as a fallback for tests).
   - scripts/vo-clean: trim leading/trailing silence, shorten every internal pause longer than 0.25 s to 0.18 s, loudness-normalize to -14 LUFS, optional atempo 1.05–1.10 when the speech rate is under 2.6 words/s. Never cut inside a word.
   - scripts/vo-align: word-level timestamps with Whisper via @remotion/install-whisper-cpp → vo/<ID>.words.json, then compare to the script text and fail loudly on mismatched words.
   - Each video is a JSON spec (videos/specs/<ID>.json): id, concept, script, beats [{cue: the word (and occurrence) that starts the beat, scene component, props}], style, endscreen variant. Scene start frames come from the cue words' timestamps; total length = last word end + 0.15 s + endscreen. No hard-coded durations.
   - Captions: burned-in, word-synced from words.json, 2–4 words per page, Inter Tight 600, keyword highlight in the accent color, centered at x 540, one fixed band per video (top band y 280–380 when UI fills the middle, otherwise y 1180–1380), never jumping between positions inside a video, never covering a UI element the voice is talking about.
   - scripts/vo-check: report pauses over 0.35 s, first word later than 0.3 s, and any beat that starts more than 3 frames away from its cue word. Rendering is blocked until it passes.
5. Reusable scenes: KineticText (typewriter, slam, highlight; center-aligned text, the block centered horizontally and vertically in the y 260–1420 band, no large empty area during the first 1.5 s, each word on its spoken frame), PhoneFrame with a real UI capture, CursorTap, CardReveal (spring flip), LightSweep, CheckDraw (the two checks from the logo drawing themselves), StatOrQuote (text only, no invented numbers), Endscreen.
6. Commands: npm run video:prepare <ID> (clean + align + check), npm run video:render <ID>, npm run video:batch <BATCH> (all five), and a still at the hook frame for the TikTok cover.
7. No music in renders (I add a sound from TikTok's Commercial Music Library in the app). Mark nothing as made by a real company; no real company logos.
Build a 10-second test spec that shows a word-synced KineticText, one real UI capture and the endscreen, using Kokoro for the voice, and send me the MP4 plus the vo-check report.
```

## Prompt: batch-ul de mâine (5 video + Excel)

Promptul se oprește după scripturi, ca să generezi vocea în AI Studio, apoi continuă singur până la render și Excel. Exportă întâi acest document ca Markdown în `docs/tiktok-campaign.md`.

```text
Produce batch TW-B01 (5 TikTok videos) with the pipeline in apps/videos. Read docs/tiktok-campaign.md (concepts table, voice rules, Excel structure) and docs/POSITIONING.md first.

Part 1 — scripts (stop after this part):
1. For each of the 5 concepts in the concepts table, use the art-director / video-creator skill to write: hook (first 1.5 s, on screen AND spoken), story beats with the cue word for each beat, the narration (75–90 words, written for voice: sentences of 6–14 words, no ellipses, no dashes, numbers as words), on-screen text per beat, CTA "Join the waitlist — link in bio", cover text (max 5 words) and the cover frame.
2. Keep the five truly different on all axes from the table (audience, message, hook type, visual style, animation style). Same voice for all five.
3. No invented numbers, users, ratings or testimonials. Demo apps are fictional and marked "illustrative". Don't name competitors.
4. Write vo/TW-B01-V1.txt … V5.txt (narration + the style instruction for Google AI Studio from docs/tiktok-campaign.md) and the spec JSON for each video. Show me the five scripts side by side and wait. I will either drop vo/<ID>.wav files in, or tell you to use ElevenLabs.

Part 2 — when the voices are in:
5. Run video:prepare for each (clean, align, check). If vo-check fails on a pause or pacing problem, fix it in the audio (never by stretching visuals) and tell me if a re-recording is needed.
6. Build each composition on the word timestamps; every UI scene follows the 1:1 rule and gets a side-by-side check image.
7. Render to out/TW-B01/<ID>.mp4 plus a cover PNG from the cover frame. Watch each render (sample frames every 0.5 s and around every cut) and check: hook readable by 1.5 s, captions in sync, nothing in TikTok's UI zones, endscreen logo correct, no typos.
8. Create or update marketing/tiktok-tracker.xlsx exactly as described in docs/tiktok-campaign.md: one row per video in Videos (all posting fields, the creative attributes and the absolute file paths), Status = Rendered. Leave every metric column empty.
9. Finish with a table: ID, length, word count, words per second, longest pause, hook text, and anything I should check by eye.
```

## Structura Excel-ului de tracking

Un singur fișier, `marketing/tiktok-tracker.xlsx`, cu 5 foi. E construit ca UiPath să poată citi și scrie fără surprize: antetul pe rândul 1, un rând per înregistrare, fără celule îmbinate, date în format `YYYY-MM-DD HH:MM`, cheia `Video ID` peste tot. UiPath scrie doar în coloanele lui; formulele stau numai în foaia Analysis.

| Foaie | Un rând = | Cine scrie | Coloane |
| --- | --- | --- | --- |
| Videos | un video | Claude Code (creație), UiPath (postare) | Video ID · Batch · Created at · File path · Cover path · Title (intern) · Caption (100–150 caractere, cu întrebare sau CTA) · Hashtags (3–5, separate prin spațiu) · Cover text · Pinned comment · Music search (termen pentru Commercial Music Library) · AI-generated label (Yes) · Planned post time · Audience · Message · Hook type · Hook text · Visual style · Animation style · Voice source · Voice name · Duration (s) · Word count · Words per second · Parent videos (pentru iterații) · Changed variable · Status (Rendered / Posted / D1 / D5 / D10) · Posted at · TikTok URL · TikTok video ID |
| Metrics | un video × o zi de măsurare | UiPath | Video ID · Snapshot (D1 / D5 / D10) · Captured at · Views · Likes · Comments · Shares · Saves · Avg watch time (s) · Full-watch rate (%) · New followers · Profile views · Traffic source For You (%) · Traffic source other (%) |
| Signups | o zi | Claude Code, din export-ul de admin | Date · Explorer signups · Maker signups · From TikTok bio (utm) · Found via TikTok · Videos posted that day |
| Analysis | un video × o zi de măsurare | Claude Code | Video ID · Snapshot · Share+save rate · Comment rate · Like rate · Retention (avg watch / duration) · Rank per metric în batch · Score · Rank în batch · Top 2 (Yes/No) |
| Learnings | o observație | Claude Code | Date · Batch · Snapshot · Observation · Evidence (video IDs + cifre) · Hypothesis · Action for next batch · Status (testing / confirmed / rejected) |

**Scorul.** Cu doar 5 video pe zi, cifrele brute sunt zgomotoase, așa că scorul folosește ranguri în batch, nu valori absolute. Rangul 1 e cel mai bun; scorul cel mai mic câștigă.

```latex
\text{Score} = 0.30\,R_{\text{full-watch}} + 0.30\,R_{\text{(shares+saves)/views}} + 0.20\,R_{\text{views}} + 0.20\,R_{\text{comments/views}}
```

Vizionarea completă și share-urile cu salvările cântăresc cel mai mult pentru că arată că video-ul a ținut atenția și că oamenii l-au vrut din nou; vizualizările brute depind mult de distribuția algoritmului din prima oră.

## Prompt: analiza zilnică și batch-ul următor

Fiecare batch nou se construiește pe primele 2 video, dar fiecare variantă schimbă o singură variabilă: doar așa afli ce a funcționat de fapt. Un loc din cinci rămâne pentru explorare, ca să nu rămâi blocat pe o singură direcție.

| Loc în batch | Ce este |
| --- | --- |
| V1, V2 | Iterații ale video-ului nr. 1: aceeași idee, câte o singură variabilă schimbată (de exemplu hook-ul, apoi stilul vizual) |
| V3, V4 | Iterații ale video-ului nr. 2, la fel |
| V5 | Explorare: un concept nou sau o variabilă netestată încă |

**Prompt zilnic (după ce UiPath a scris datele D1)**

```text
Run the daily TikTok analysis and produce the next batch. Read marketing/tiktok-tracker.xlsx and docs/tiktok-campaign.md first.

1. Check the data: every video of the latest posted batch has a D1 row in Metrics. If any is missing or looks wrong (views 0, rates over 100%), stop and tell me which.
2. Fill Analysis for that batch: rates, ranks within the batch, Score with the formula in docs/tiktok-campaign.md, rank, Top 2.
3. Write Learnings: for the top 2 and the bottom video, what they had in common or not (audience, message, hook type, visual style, animation, length, words per second, posting time), each as observation → evidence with the numbers → hypothesis → action. Mark earlier hypotheses confirmed or rejected when today's data speaks to them. With 5 videos a day, say clearly when a difference is too small to trust.
4. Plan the next batch with the slot rules in docs/tiktok-campaign.md: V1–V2 iterate on video #1, V3–V4 on video #2, V5 explores. Every iteration changes exactly ONE variable from its parent; record Parent videos and Changed variable in Videos.
5. Then run the same production flow as batch TW-B01 (scripts, stop for voices, prepare, render, checks, Excel rows), with the next batch ID.
6. Update the Signups sheet from the latest CSV export in marketing/exports/ and add one line to Learnings about signups vs the videos posted that day — correlation only, never claimed as attribution.
7. End with a short summary: winner and why (with numbers), what the next batch tests, and the five hooks.

On D5 and D10 (when those snapshots arrive) also run the long-term analysis: compare each video's D1 → D5 → D10 growth, flag slow burners (low D1 rank, high D10 rank), recompute which patterns win on D10 vs D1, and add a "Winning patterns" summary at the top of Learnings that future batches must read first.
```

## Decizii deschise

- [ ] **Sursa vocii pentru batch-ul 1:** tu în Google AI Studio sau ElevenLabs cu cheie API; și numele vocii, păstrat la toate cele 5.
- [ ] **Contul TikTok:** business sau personal; de el depind linkul din bio și accesul la statistici.
- [ ] **Datele:** `MAKER_ACCESS_DATE` (deschiderea pentru makeri) și `LAUNCH_DATE` (lansarea publică), cu 7 zile între ele.
- [ ] **Serviciul de email** pentru confirmări și invitații (Resend sau Cloudflare Email).
- [ ] **Ora de postare:** aceeași pentru toate 5 în primul batch, ca ora să nu devină o variabilă; o testăm separat mai târziu.
- [ ] **Eticheta de conținut AI** în TikTok: se pune pe fiecare video, pentru că vocea e generată.
