# Tryworthy TikTok videos

Remotion project for the campaign in `docs/tiktok-campaign.md`. Standalone npm package (not a bun
workspace): `cd apps/videos && npm install` once. Needs ffmpeg/ffprobe on PATH (or `FFMPEG_PATH`,
`FFPROBE_PATH`).

## One video

1. `specs/<ID>.json`: id, concept, script, beats (each starts on its cue word: `"save"` or `"save#2"`), style, endscreen, cover, captures.
2. `vo/<ID>.txt`: the style instruction for Google AI Studio, a line `---`, then the exact narration (same words as the spec's script).
3. `vo/<ID>.wav`: your recording, or `npm run video:voice <ID>` (ElevenLabs when `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` are set, Kokoro otherwise, for tests only). Existing recordings are never overwritten without `--force`.
4. `npm run video:capture <ID>`: real pages for UI scenes, from the video-capture stack and its seeded catalog (see below).
5. `npm run video:prepare <ID>`: vo-clean → vo-align → vo-check. Report in `out/checks/<ID>.vo-check.md`.
6. `npm run video:render <ID>`: blocked until the latest vo-check passed. Writes `out/[<batch>/]<ID>.mp4`, `<ID>.cover.png` (the cover frame) and `out/checks/<ID>-beat<N>.png` (real page | video frame) for every UI scene.

`npm run video:batch <BATCH>` prepares and renders every spec of a batch. `npm run video:relayout <ID>` re-breaks every KineticText phrase into balanced lines that fit the 720 px column (`src/lib/kinetic.ts`); `npm run video:tracker <BATCH>` creates or updates `marketing/tiktok-tracker.xlsx` from the rendered videos (Videos sheet only; UiPath columns and the other sheets are never touched). `npm run video:sheet [scene…]` renders a contact sheet of the gallery scenes at their key frames (`src/lib/gallery.ts`) with the layout overlay to `out/checks/scene-gallery.png`. `npm run studio` opens Remotion Studio (the `SceneGallery` composition previews all scenes; set `debugSafeZone` to see the layout zones, the center line, caption boxes and focus areas).

## Rules the pipeline enforces

- The voice is the clock: beats start on their cue words. Every script ends with "Join the waitlist, link in bio.": the endscreen starts on its "Join" ("link in bio" lands on its word) and the video ends 0.6 s after the last word. No hard-coded durations. (TEST-01 predates this rule and keeps its old 2 s endscreen.)
- vo-clean: trims the ends, cuts pauses over 0.25 s to 0.18 s (only inside silence), keeps the recorded tempo (target 2.8–3.5 words/s; re-record rather than stretch), -14 LUFS (±0.3, up to six gain passes through the limiter), true peak under -1.5 dBTP.
- vo-align: Whisper (whisper.cpp in `.whisper/`, `small.en`, one word per segment, a brand-vocabulary hint) gives the timings, snapped to the audio. Apostrophes are ignored when comparing ("maker's" = "makers'"), and "gonna" counts for "going to" (listed in the report). When `small.en` disagrees with the script, `medium.en` listens too (`WHISPER_CHECK_MODEL`): if it hears the script, those words are accepted with `small.en`'s timings and listed as corrections in the report; if not, the voice differs from the script and the video isn't prepared. (`medium.en`'s own timestamps drift late, so they are never used.) `out/checks/<ID>.align.md` reports, per word, what Whisper heard, how it matched, Whisper's confidence and how far snapping moved it.
- Layout: every element is centered on the frame's center line x = 540 (never on a zone's middle). Critical text and the UI the voice talks about stay inside x 180–900 × y 260–1420; decoration (phone bezel, shadows) may reach x 100–980 × y 200–1500; nothing important in the bottom 500 px. Scenes place their main element with `src/lib/stage.ts`, which vo-check reads too.
- vo-check: pauses over 0.35 s (measured in the audio), first word after 0.3 s, a beat more than 3 frames from its cue, a scene's main element more than 8 px off x = 540 or outside its zone, caption pages outside 2–4 words, captions on top of the UI the voice talks about, key UI outside the safe zone, script and narration file out of sync, missing captures, no closing CTA, more than 0.8 s of silence at the end, a batch script outside 75–90 words, text under 4.5:1 contrast, a dark video without the dark endscreen (white wordmark), a CardCrop captured under device scale 3, a KineticText line too wide for the 720 px column (the type shrinks to fit, never under 72 px), a KineticText beat that leaves the screen empty for over 0.3 s waiting for its first word (start the beat on that word). Warnings: pace outside 2.8–3.5 words/s, and any shot that holds longer than 1.5 s without a meaningful change (cut, move inside the phone screen, highlight, cursor action, state switch, light sweep, kinetic word; `src/lib/events.ts`).
- PhoneFrame: a fixed phone (640 px, centered, y 440–1500); scroll and zoom move the capture inside the screen, the bezel never scales. Detail beats cut to CardCrop: the one row or card the voice talks about, cut from the real capture (device scale 3), 720 px wide, centered, with an optional highlight and light sweep. The UI the voice talks about needs text of at least 40 px (names) and 32 px (other text) in the video: captures record the smallest text of every target and vo-check fails below that.
- Captions: one line per page, centered on x = 540, in one band for the whole video: top (y 280–380) when a UI scene fills the middle, otherwise bottom (y 1180–1380); `style.captions` overrides it. A beat can only hide them (`"captions": "none"`), never move them.
- Captures record the page's real width (the site is about 320 px wide at least, so a narrower viewport still produces a wider image): scenes place the image by that width, so the UI is never squeezed and highlights land on their elements.
- Real UI only: PhoneFrame and CardCrop show Playwright captures of the real pages, from the seeded video-capture database only, with every number hidden (save counts, dates, ranks; the capture fails if a digit is still visible), marked "Illustrative". No invented numbers (StatOrQuote refuses digits), no real company names or logos, no music.

## Demo data for captures

Captures never use the dev or test database. They come from a separate stack with its own local D1 database (`docker-compose.video.yml` in the sibling `ToolMarketPlace-docker` folder): site on http://localhost:4331, API on :8797, launched (no waitlist), no dev demo data. `seed/` fills it with a deterministic, fictional catalog:

- `seed/products.ts`: 16 products across 17 categories, a few perks and pre-launch products, names checked against web search, URLs under example.com, no numbers in any text.
- `seed/thumbnails.ts`: generated neutral app thumbnails (no text, no logos).
- `seed/seed.ts`: goes through the real API (sign-up, upload, publish, perks); SQL only confirms emails, verifies the example.com domains, fixes the publish order and sets the quality flag. Nobody saves or claims anything. It refuses a container without `VIDEO_CAPTURE_DB=1` and a database that isn't empty.

```sh
cd ../ToolMarketPlace-docker
docker compose -p toolmarket-video -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.video.yml up -d --build
cd ../ToolMarketPlace && npm run video:seed
# To seed again, recreate only this stack's database: the same compose command with `down -v`, then up and seed.
```

`/top` always lists the products in the order of `seed/products.ts`. `video:capture` refuses any site that lists a product outside the seed. For a CardCrop, capture at a page width where the element's text reaches 40/32 px at 720 px wide: a product row needs 300 CSS px (its name is 15 px, so 720 / 268 ≈ 2.69× → 40 px).
