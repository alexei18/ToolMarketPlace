# Tryworthy — ghidul de mișcare video (nivelul referințelor)

Nov 4, 2026 · @Alexei

## Diagnoza

Referințele nu arată mai bine din cauza efectelor, ci din cauza a trei lucruri pe care video-urile noastre nu le au: o poveste cu o întorsătură, sunet construit în jurul acelei întorsături și o scenă vizuală în care se mișcă ceva în fiecare cadru. Efectele (crom 3D, motion blur, grafice animate) vin abia pe locul patru.

Toate trei sunt făcute de aceeași marcă (Noiz), în același stil, cu aceeași structură. Le folosim ca standard de calitate și ca lecție de meserie, nu ca model de copiat: niciun text, slogan, nume sau idee de poveste nu se preia.

|  | Primul nostru batch | Referințele |
| --- | --- | --- |
| Poveste | Mesaj explicat de la început la sfârșit | Tensiune, apoi o întorsătură, apoi produsul ca răspuns |
| Sunet | Doar voce | Voce + efecte sonore pe fiecare tăietură; muzica intră abia la întorsătură, cu un „drop” |
| Voce | Continuă, rapidă, peste tot video-ul | Lentă, dramatică, cu pauze gândite; tace în a doua jumătate și lasă muzica |
| Scenă | Fundal alb plat, interfață în telefon | Negru adânc, grain, lumină, adâncime, un obiect-erou 3D din crom |
| Mișcare | Elemente care apar și stau | Ceva se mișcă în fiecare cadru: cameră care alunecă, reflexii, blur, contoare, liste care cad |
| Ritm | La fel de la început la sfârșit | Lent în prima parte (1,5–3 s pe cadru), foarte rapid după drop (0,4–1 s) |
| Tipografie | Text mare centrat + subtitrare în pastilă | Titluri editoriale uriașe, etichete mici monospace, subtitrare fină fără fundal |
| Interfața produsului | Prezentată ca subiect principal | Apare ca dovadă, în montajul rapid de după drop |

## Ce fac cele 3 referințe

Toate trei au aceeași schelet: o poveste spusă lent, cu voce și efecte sonore, fără muzică; o întorsătură marcată de intrarea muzicii; un montaj rapid cu produsul; final cu logo-ul 3D și o dată concretă. Timpii de mai jos sunt măsurați din video-uri (cadre și spectrogramă).

|  | Ref. 1 · poveste cinematică (40 s) | Ref. 2 · „raport de incident” (41 s) | Ref. 3 · fake-out cu umor (24 s) |
| --- | --- | --- | --- |
| Hook (0–2 s) | Ecran aproape gol, un simbol mic în centru; vocea începe în șoaptă | Titlu uriaș care sună a anunț de închidere | Titlu uriaș în majuscule, cuvânt cu cuvânt, care sună a scandal |
| Actul 1 (tensiune) | Vocea spune povestea în 45 de cuvinte, \~2,4 cuvinte/s, cu pauze voite de 0,4–1 s | Titlurile spun povestea, vocea le citește; grafice și loguri care cresc | Cifre care cresc, interfața se descompune în wireframe, un personaj 3D care râde |
| Întorsătura | „și de data asta… ești devreme” | Problema e de fapt dovada cererii uriașe | „Glumeam”, pe un cadru alb care inversează tot |
| Intrarea muzicii | La \~20 s, cu riser și lumină | La \~21 s | La \~10,5 s |
| Actul 2 (dovadă) | 15 s fără voce: titlu editorial, card de produs, listă care cade, grilă de caractere | Cifre 3D crom, grafice, formularul real de waitlist, cardul de produs | 10 s: interfața reală, contor real de înscrieri, funcții, categorii |
| Final | Logo crom 3D + „get here first” + adresa | Logo crom 3D + adresa + data deschiderii | Logo crom 3D cu sclipiri + adresa + data |

**Tehnicile care fac diferența**

1. **Un obiect-erou 3D din crom** (litera mărcii, apoi logo-ul): reflexii care alunecă, cameră foarte aproape, profunzime de câmp, podea care reflectă. Apare de 3–4 ori în video și îl leagă.
2. **Ceva se mișcă tot timpul**: chiar într-un cadru „static”, camera alunecă 2–4%, lumina trece peste obiect sau un contor ticăie.
3. **Tranziții cu sens, nu decorative**: focus pull (totul trece prin blur), match cut (litera din grilă devine litera 3D), descompunerea interfeței în wireframe care se strânge într-un singur pătrat, flash alb la întorsătură.
4. **Tipografie editorială**: titluri foarte mari, strânse, pe o margine fixă; etichete monospace mici în colțuri (ca un HUD de dashboard: sursă, oră, număr de caractere).
5. **Date animate**: contoare care se rostogolesc, grafice care se desenează, liste care cad cu motion blur, diagrame radiale. Unde apar cifre, sunt reale (din baza lor de date).
6. **Interfața produsului ca dovadă**: card cu reflexie holografică care se înclină ușor, formular real, rânduri reale; apare după drop, rapid.
7. **Subtitrare fină**: text mic, alb, centrat în treimea de jos, cuvintele nerostite încă gri; fără fundal. În ref. 2 nu există subtitrare: titlul de pe ecran e chiar fraza rostită.
8. **Sunet**: în actul 1 doar voce + efecte (click pe fiecare cuvânt, whoosh pe tăieturi, impact pe dezvăluiri); înainte de drop un riser și o fractăură de liniște; după drop muzica e constantă și puternică (bas mult).

## Structura în 4 acte

Fiecare video urmează același schelet de 28–35 s; ce variază de la un video la altul e mecanismul poveștii și tehnica-vedetă, nu structura.

&#91;embedded content: structura unui video · 5 momente, 3 straturi\]

Prima jumătate e lentă și vorbită, fără muzică; drop-ul de pe întorsătură o schimbă într-un montaj rapid și mut, purtat de muzică, până la logo și CTA. Timpii sunt orientativi: durata exactă o dă vocea.

## Identitatea video Tryworthy

Regula de bază: **scenă întunecată, produs alb**. Video-urile se joacă pe negru, ca semnul crom să aibă lumină și reflexii; interfața albă a aplicației apare ca o ferestră luminoasă în întuneric și iese în evidență. Site-ul rămâne alb; doar în video folosim scena neagră.

| Element | Regulă |
| --- | --- |
| Fundal | `#0A0A0A`, cu grain animat 3–5% și vignetare ușoară; niciodată negru plat |
| Text | Alb `#F5F5F3`; text secundar alb la 45%; cuvintele nerostite încă la 30% |
| Accent | Verde `#3CCB8A`, doar pe al doilea check, pe un cuvânt-cheie pe scenă și pe CTA; maxim un element verde pe cadru |
| Obiect-erou | Semnul Tryworthy (cele două check-uri) extrudat 3D: primul check crom argintiu, al doilea crom cu tentă verde; podea neagră care reflectă |
| Logo final | Wordmark-ul „tryworthy.” extrudat 3D în crom, construit din fișierul SVG final (nu din font); punctul verde |
| Titluri | Inter Tight 700, foarte mari (120–220 px la 1080), spațiere −0,04 em, rânduri strânse (0,95) |
| Etichete HUD | Font monospace (JetBrains Mono sau Geist Mono), 20–24 px, majuscule, spațiere 0,2 em, alb la 45%, în colțurile cadrului |
| Subtitrare | Inter 500, 44–48 px, alb, centrată la y ≈ 1250, fără fundal; cuvântul rostit trece din 30% în 100% |
| Interfața produsului | Capturi reale din aplicație, pe seed-ul demo, fără ramă de telefon când se poate: carduri și rânduri decupate, mari, care plutesc ușor în 3D |

**Layout: două moduri, niciodată întâmplătoare**

- **Centrat** (axa x = 540): obiectul-erou, enunțurile scurte, logo-ul final, subtitrarea.
- **Editorial** (margine stânga fixă la x = 96, titlu sus): scenele de tip raport, cu date, liste și grafice; ca în referința 2. Regula de centrare de dinainte rămâne pentru modul centrat.
- Într-un video pot apărea ambele moduri, dar fiecare scenă alege unul; textul important stă în x 96–900 și y 260–1420.

**Ce nu preluăm de la Noiz:** literele lor crom, sloganurile, textele, structura exactă a cadrelor, personajul 3D. Preluăm doar nivelul de execuție și principiile.

## Vocabularul de mișcare

Claude Code construiește o singură dată aceste 18 componente, apoi fiecare video le combină. Fiecare are un efect clar și un sunet asociat; nicio scenă nu se construiește de la zero în batch.

| Componentă | Ce face | Sunet | Pachete Remotion |
| --- | --- | --- | --- |
| `Stage` | Fundalul comun: negru, grain animat, vignetare, încetinire ușoară a camerei pe orice cadru | Room tone foarte jos | `@remotion/noise` |
| `ChromeMark` | Semnul cu două check-uri extrudat 3D, crom, pe podea care reflectă; mișcări de cameră presetate: macro alunecare, orbită lentă, push-in, rotație de dezvăluire | Swell grav sub obiect | `@remotion/three` (React Three Fiber, drei, postprocessing: DOF, bloom) |
| `ChromeWordmark` | „tryworthy.” 3D crom pentru final, cu o sclipire care trece pe litere | Impact + shimmer | `@remotion/three` |
| `LightSweep` | O bandă de lumină trece peste crom sau peste un card | Shimmer scurt | — |
| `FocusPull` | Tranziție: totul trece prin blur 0 → 40 px și iese clar în cadrul următor | Whoosh moale | `@remotion/transitions` |
| `MatchCut` | Un element din cadrul A devine același element în cadrul B (de exemplu un check dintr-o listă devine semnul 3D) | Impact | `@remotion/transitions` |
| `WireframeCollapse` | Interfața reală se descompune element cu element în cutii-schelet, apoi totul se strânge într-un singur pătrat | Glitch + click-uri | — |
| `HeadlineSlam` | Titlu uriaș, cuvânt cu cuvânt, tăiere tare pe fiecare cuvânt rostit | Click sec pe fiecare cuvânt | `@remotion/layout-utils` (fitText) |
| `TypeBackspace` | Text scris cu cursor, șters și rescris (de exemplu o căutare) | Taste | — |
| `HudFrame` | Ramă fină + etichete monospace în colțuri (sursă, oră, număr) pentru scenele editoriale | — | — |
| `CounterRoll` | Cifră care se rostogolește și se oprește pe o valoare; opțional se dizolvă în puncte LED; doar cu cifre reale | Ticăituri care accelerează | — |
| `ChartDraw` | Grafic linie sau bare care se desenează, cu eticheta care urmează vârful | Riser scurt | `@remotion/paths` (evolvePath) |
| `ListCascade` | Rânduri care intră din lateral cu motion blur, la ritmul muzicii | Whoosh-uri scurte | `@remotion/motion-blur` |
| `GridPopulate` | Grilă care se umple element cu element, apoi totul se stinge în afară de unul | Pop-uri, apoi un ton | — |
| `FloatCard` | Card real de produs care se înclină ușor în 3D, cu reflexie care alunecă | Swoosh | — |
| `UiDive` | Camera intră în interfața reală (zoom și pan în captură), cursor care apasă și stările reale ale butoanelor | Click-uri UI | — |
| `FlashInvert` | Un cadru alb de 2–4 frame-uri care inversează scena la întorsătură | Impact puternic | — |
| `KaraokeCaption` | Subtitrarea fină: cuvântul rostit trece din gri în alb | — | `@remotion/captions` |

**Reguli de mișcare**

1. Ceva se mișcă în fiecare cadru; un cadru complet static mai lung de 0,5 s e greșeală.
2. Intrările folosesc easing expo-out sau spring fără săritură (damping mare); nimic nu „sare” în stil cartoon.
3. Orice mișcare rapidă are motion blur.
4. Adâncime: fundalul e mereu ușor blurat sau mai întunecat decât subiectul.
5. Tăieturile cad pe cuvinte (în actul 1) sau pe batăile muzicii (în actul 2), niciodată la întâmplare.
6. Tranzițiile speciale (FocusPull, MatchCut, WireframeCollapse, FlashInvert) au fiecare un motiv în poveste; restul sunt tăieturi tari.

## Sunet, voce și subtitrări

Sunetul se construiește în video și se exportează cu el; nu se mai adaugă muzică din aplicația TikTok, pentru că drop-ul trebuie să cadă exact pe întorsătură, la nivel de cadru.

**Vocea (regulile noi înlocuiesc pe cele vechi)**

- Vocea spune doar actul 1 și CTA-ul final: 40–60 de cuvinte. Actul 2 e fără voce; povestește muzica și textul de pe ecran.
- Ritm în actul 1: 2,3–3,0 cuvinte/s, mai lent și mai șoptit decât în TEST-01.
- **Pauzele voite sunt permise, cele întâmplătoare nu.** În script, o pauză voită se scrie `[beat 0.6]`; curățarea automată o păstrează exact la acea durată (între 0,3 și 1,0 s) și scurtează orice altă pauză peste 0,25 s. Fiecare pauză voită are pe ecran o dezvăluire și un efect sonor.
- Instrucțiunea de stil pentru AI Studio: *„Read this like a calm, confident narrator in a short film trailer: low, close to the microphone, unhurried, slight tension, never salesy. Pause only where the script says \[beat\].”*

**Harta sunetului pe acte**

| Act | Ce se aude |
| --- | --- |
| 1 · hook și tensiune | Voce + room tone grav foarte jos + efecte pe fiecare eveniment (click pe cuvinte, whoosh pe tăieturi, impact pe dezvăluiri). Fără muzică. |
| Întorsătura | Riser de 1–2 s, apoi 0,3–0,5 s de liniște aproape totală, apoi drop-ul muzicii împreună cu un impact și FlashInvert sau MatchCut |
| 2 · dovada | Muzica tare și constantă; tăieturile pe batăi; efecte doar pe momente-cheie (contor, click pe buton) |
| 3 · brand și CTA | Impact pe logo, vocea spune CTA-ul peste muzică (muzica coborâtă cu 10–12 dB), coada muzicii până la final; fără liniște la sfârșit |

**Mixaj:** total −14 LUFS, vârf sub −1 dBTP; vocea mereu clar deasupra; efectele nu acoperă niciodată un cuvânt.

**Licențe.** Orice postare care promovează un produs e conținut comercial, indiferent de tipul contului, deci muzica trebuie să fie din Commercial Music Library a TikTok sau dintr-un catalog cu licență care acoperă explicit uz comercial pe social media; la upload se completează confirmarea de utilizare a muzicii ([Soundstripe](https://www.soundstripe.com/blogs/tiktok-music-licensing-rules)). „Royalty-free” nu înseamnă automat că acoperă asta. Pentru fiecare piesă și efect se notează în Excel sursa și licența.

**Subtitrări**

- În scenele centrate: KaraokeCaption, 2–4 cuvinte, la y ≈ 1250, fără fundal.
- În scenele editoriale: fără subtitrare separată; titlul de pe ecran e chiar fraza rostită (HeadlineSlam).
- Niciodată două texte care spun același lucru în același cadru.

## Cele 5 concepte pentru B02

Fiecare concept are aceeași structură în 4 acte, dar alt mecanism de poveste și altă tehnică-vedetă, ca să aflăm ce prinde. Toate au 28–35 s. Textele de voce sunt schițe: Claude Code le finalizează, dar păstrează întorsătura și nu adaugă cifre sau afirmații nedovedite. Produsele din interfață sunt cele fictive din seed, marcate „illustrative”.

| ID | Mecanism | Hook (0–2 s) | Actul 1 — voce (schiță) | Întorsătura și drop | Actul 2 — dovada (fără voce) | Tehnica-vedetă |
| --- | --- | --- | --- | --- | --- | --- |
| TW-B02-V1 · Somewhere | Poveste cinematică | Negru; un punct verde mic pulsează în centru, ca o notificare | „Somewhere, right now, someone just shipped the app you've been looking for. \[beat 0.6\] It took them a weekend. \[beat 0.5\] Tonight it has one visitor. \[beat 0.4\] Them. \[beat 0.8\] The good ones don't go viral. They go quiet. \[beat 0.6\] Unless someone's watching.” | Pe „watching” punctul se întinde în semnul 3D crom care se rotește în poziție | FloatCard cu un produs, ListCascade cu Top this week, FocusPull pe Trending, LightSweep pe un perk, GridPopulate de categorii din care una devine verde | ChromeMark |
| TW-B02-V2 · Field notes | Raport editorial | HudFrame + titlu: „Every day, new apps launch.” peste un log de lansări | „Every day, new apps launch. \[beat 0.4\] Most of them, you'll never see. \[beat 0.5\] Not because they're bad. \[beat 0.6\] Because launch day rewards whoever shouts loudest.” (titlurile sunt chiar frazele) | „So we changed the rules.” → drop | Diagramă radială a semnalelor (saves, perk claims, feedback, tries), clasamentul se reordonează cu ListCascade, „Nobody can pay to rank.”, rânduri reale de produs | HudFrame + ChartDraw |
| TW-B02-V3 · Not yet | Fake-out pentru makeri | HeadlineSlam: „We're not letting you in.” | „We're not letting you in. \[beat 0.6\] Not yet. \[beat 0.5\]” — TypeBackspace transformă „Not yet.” în „Makers first.” — „If you build apps, you get in a week before everyone else.” | FlashInvert pe „first” + drop | UiDive în fluxul real: lipești linkul, se completează singur titlul și imaginea, butonul Publish, badge-ul Founding maker, produsul apare în Top | HeadlineSlam + FlashInvert |
| TW-B02-V4 · One tab | Umor + supraîncărcare | File de browser care se înmulțesc pe tot ecranul | „Quick question. \[beat 0.4\] How many tabs do you have open right now? \[beat 0.6\] Newsletters. Launch sites. A thread with endless replies. \[beat 0.5\] All to find one app worth trying.” | WireframeCollapse: toate filele se strâng într-un singur pătrat, care devine semnul 3D prin MatchCut + drop | Un singur feed: Top this week, categoriile, un perk; titlu final „One tab.” | WireframeCollapse + MatchCut |
| TW-B02-V5 · Search won't find it | Mecanică de căutare | Bară de căutare: se scrie „best new app for notes” | „You can't search for an app you don't know exists. \[beat 0.6\] Search shows you what's already famous. \[beat 0.5\] The new ones? \[beat 0.4\] They're not in there yet.” (rezultatele sunt rânduri generice blurate, fără nume reale; textul se șterge și se rescrie) | „They're here.” → bara de căutare se transformă în chip-urile de categorii Tryworthy + drop | Feed cu badge-uri „Just launched” și „Pre-launch”, LightSweep pe un perk, cardul se înclină | TypeBackspace + morph |

Toate se termină la fel: ChromeWordmark, voce „Join the waitlist. Link in bio.” (V3: „Get early access. Link in bio.”), textul pe ecran și data lansării dacă e setată în config.

## Standardul de calitate

Niciun video nu ajunge la tine până nu trece de verificările automate și nu ia minim 4 din 5 la fiecare criteriu de mai jos. Claude Code își dă singur notele, pe un contact sheet cu un cadru la fiecare 0,25 s, pus lângă cadre din referințe.

**Verificări automate (blochează render-ul)**

- Nicio zonă statică: diferența între cadre consecutive nu e zero mai mult de 0,5 s, în afară de pauzele voite.
- Fiecare tăietură din actul 1 cade la maxim 2 cadre de un cuvânt sau de un `[beat]`; fiecare tăietură din actul 2 la maxim 2 cadre de o batăie a muzicii.
- Drop-ul muzicii cade la maxim 1 cadru de cuvântul întorsăturii.
- Fiecare tăietură și fiecare dezvăluire are un efect sonor.
- Liniște la final sub 0,3 s; mixaj −14 LUFS ±1, vârf sub −1 dBTP.
- Textul important în zona sigură; contrast suficient pe negru.
- Nicio cifră care nu vine din baza de date; niciun nume de marcă reală.

**Nota pe criterii (1–5, minim 4 la fiecare)**

| Criteriu | 5 înseamnă |
| --- | --- |
| Hook | În primele 1,5 s există o întrebare deschisă sau o afirmație care șochează; fără logo, fără numele produsului |
| Poveste | Există o întorsătură clară; produsul apare ca răspuns, nu ca subiect |
| Densitate de mișcare | Ceva se mișcă în fiecare cadru; ritmul se schimbă după drop |
| Adâncime și material | Lumină, reflexii, blur de profunzime, grain; nimic nu arată a slide plat |
| Tipografie | Titlurile au scară și intenție; etichetele HUD sunt consistente; niciun text redundant |
| Sincronizare sunet | Efectele, drop-ul și tăieturile se simt „pe batăi” |
| Claritatea produsului | După video, spectatorul știe ce e Tryworthy și ce primește dacă se înscrie |
| Final | Logo-ul crom arată premium; CTA rostit și scris; fără coadă mută |

**Verdictul final îl dai tu.** Dacă un video nu te face să-l vrei revăzut, nu se postează, oricare ar fi notele.

## Prompturi Claude Code

Trei pași, în ordine: întâi se construiește trusa de unelte, apoi un singur video de referință la calitate maximă, apoi restul batch-ului după ce aprobi mostra.

**Înainte, de făcut de tine**

- [ ] Exportă acest document ca Markdown în `docs/video-motion-bible.md`.
- [ ] Pune cele 3 video-uri de referință în `apps/videos/refs/` (doar pentru studiu, excluse din git; nu apar niciodată în render-uri).
- [ ] Alege 3–5 piese de muzică cu un drop clar, dintr-un catalog cu licență care acoperă explicit uz comercial pe social media; pune-le în `apps/videos/public/music/` cu dovada licenței.
- [ ] Opțional: un pachet de efecte sonore cu licență comercială în `apps/videos/public/sfx/`.

**Promptul A — trusa de unelte (plan mode)**

```text
Upgrade apps/videos to the level described in docs/video-motion-bible.md. Read the whole file first.

0. Install the official Remotion agent skills (npx skills add remotion-dev/skills) and follow remotion-best-practices for everything below. Study the reference videos in apps/videos/refs/: make contact sheets every 0.25 s around their hooks, twists and endings into out/refs/, and write a short note per reference on timing, motion and sound. They are for study only: never use their frames, text, slogans, letters or characters in our renders.
1. Packages (same Remotion version, via npx remotion add where possible): @remotion/three, @remotion/motion-blur, @remotion/transitions, @remotion/noise, @remotion/paths, @remotion/layout-utils, @remotion/captions, plus three, @react-three/fiber, @react-three/drei, @react-three/postprocessing. Check the license of every asset package before using it (including @remotion/sfx) and record it in apps/videos/LICENSES.md.
2. Stage and look: implement the identity section of the bible (#0A0A0A, animated seeded grain, vignette, slow camera drift on every shot, text colors, Inter Tight + a monospace for HUD labels, both layout modes).
3. 3D: ChromeMark built from the paths in brand/tryworthy-logo/tryworthy-mark.svg (SVGLoader + ExtrudeGeometry with a bevel; never redraw the mark), left check silver chrome, right check green-tinted chrome, reflective black floor, depth of field and subtle bloom, a CC0 studio HDRI from Poly Haven in public/hdri (license recorded), and camera presets: macro glide, slow orbit, push-in, reveal spin. ChromeWordmark from the outlined paths in tryworthy-wordmark.svg, with a light sweep. Everything driven by useCurrentFrame, deterministic, no real-time clock.
4. Build every component in the bible's motion table with typed props, the motion rules and its sound cue.
5. Sound system: components emit cue events (frame + type); a SoundLayer maps cue types to files in public/sfx (with a license manifest). MusicBed: a music:analyze script finds beats and the drop of each track in public/music and writes JSON; the composition offsets the track so the drop lands exactly on the twist cue frame; the music is ducked 10–12 dB under the voice; final mix -14 LUFS, peak under -1 dBTP.
6. Voice: scripts can contain [beat 0.3–1.0]. vo-clean keeps those pauses at their exact length (±40 ms) and still shortens every other pause over 0.25 s. Update the AI Studio style line from the bible.
7. Rename vo-check to video-check and add the automatic checks from the quality section of the bible (static frames, cut and drop alignment, SFX coverage, end silence, loudness, numbers and brand names).
8. StyleGallery composition: every component for 4–6 s on the Stage with its sound. Render the MP4 and a contact sheet and send them to me with render time per second of video. Use --gl=angle for 3D if the default renderer fails.
Show me the plan first. Commit per component on a new branch feat/motion-kit from feat/videos.
```

**Promptul B — mostra de referință (un singur video)**

```text
Using the motion kit, produce only TW-B02-V1 "Somewhere" from the concepts table in docs/video-motion-bible.md, at full quality.
Part 1 (stop after this): finalize the voice script (40–60 words for act 1 plus the CTA, with [beat] marks, no numbers or claims we can't prove) and a beat sheet table: time, act, what is on screen, component, camera, SFX, music state, cue word. Pick the music track whose drop fits the twist and say why. Give me the AI Studio text, style line and file name, then wait for my recording.
Part 2: build it, run video-check, then review it yourself: a contact sheet every 0.25 s next to stills from the references at the same act, and the rubric from the bible with a score and one line of evidence per criterion. Anything under 4 → fix and review again (at most 3 rounds). Send me the MP4, the contact sheet, the rubric and the license list for the music and SFX used.
```

**Promptul C — restul batch-ului B02 (după ce aprobi V1)**

```text
TW-B02-V1 is approved. Produce V2–V5 from the concepts table in docs/video-motion-bible.md with the same two-part flow (scripts and beat sheets for all four, stop for my recordings, then build, video-check, self-review with the rubric). Keep each video's mechanism and hero technique distinct.
Update docs/tiktok-campaign.md so its concepts, voice and sound rules point to the bible. Add these columns to the Videos sheet of marketing/tiktok-tracker.xlsx and fill them for all five: Mechanism, Hero technique, Twist cue word, Drop time (s), Music track, Music license, SFX sources, Rubric scores. Keep the daily analysis flow unchanged; when it plans the next batch, the changed variable may now also be the mechanism, the hero technique or the music.
```
