# Tryworthy TikTok videos

Remotion project for the campaign in `docs/tiktok-campaign.md`. Standalone npm package (not a bun
workspace): `cd apps/videos && npm install` once. Needs ffmpeg/ffprobe on PATH (or `FFMPEG_PATH`,
`FFPROBE_PATH`).

## One video

1. `specs/<ID>.json`: id, concept, script, beats (each starts on its cue word: `"save"` or `"save#2"`), style, endscreen, cover, captures.
2. `vo/<ID>.txt`: the style instruction for Google AI Studio, a line `---`, then the exact narration (same words as the spec's script).
3. `vo/<ID>.wav`: your recording, or `npm run video:voice <ID>` (ElevenLabs when `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` are set, Kokoro otherwise, for tests only). Existing recordings are never overwritten without `--force`.
4. `npm run video:capture <ID>`: real pages for UI scenes, from the video-capture stack and its seeded catalog (see below).
5. `npm run video:prepare <ID>`: vo-clean → vo-align → video-check. Report in `out/checks/<ID>.video-check.md`.
6. `npm run video:render <ID>`: blocked until the latest video-check passed. Writes `out/[<batch>/]<ID>.mp4`, `<ID>.cover.png` (the cover frame) and `out/checks/<ID>-beat<N>.png` (real page | video frame) for every UI scene.

`npm run video:batch <BATCH>` prepares and renders every spec of a batch. `npm run video:relayout <ID>` re-breaks every KineticText phrase into balanced lines that fit the 720 px column (`src/lib/kinetic.ts`); `npm run video:tracker <BATCH>` creates or updates `marketing/tiktok-tracker.xlsx` from the rendered videos (Videos sheet only; UiPath columns and the other sheets are never touched). `npm run video:sheet [scene…]` renders a contact sheet of the gallery scenes at their key frames (`src/lib/gallery.ts`) with the layout overlay to `out/checks/scene-gallery.png`. `npm run studio` opens Remotion Studio (the `SceneGallery` composition previews all scenes; set `debugSafeZone` to see the layout zones, the center line, caption boxes and focus areas).

## Rules the pipeline enforces

- The voice is the clock: beats start on their cue words. Every script ends with "Join the waitlist, link in bio.": the endscreen starts on its "Join" ("link in bio" lands on its word) and the video ends 0.6 s after the last word. No hard-coded durations. (TEST-01 predates this rule and keeps its old 2 s endscreen.)
- vo-clean: trims the ends, cuts pauses over 0.25 s to 0.18 s (only inside silence), keeps the recorded tempo (target 2.8–3.5 words/s; re-record rather than stretch), -14 LUFS (±0.3, up to six gain passes through the limiter), true peak under -1.5 dBTP.
- vo-align: Whisper (whisper.cpp in `.whisper/`, `small.en`, one word per segment, a brand-vocabulary hint) gives the timings, snapped to the audio. Apostrophes are ignored when comparing ("maker's" = "makers'"), and "gonna" counts for "going to" (listed in the report). When `small.en` disagrees with the script, `medium.en` listens too (`WHISPER_CHECK_MODEL`): if it hears the script, those words are accepted with `small.en`'s timings and listed as corrections in the report; if not, the voice differs from the script and the video isn't prepared. (`medium.en`'s own timestamps drift late, so they are never used.) `out/checks/<ID>.align.md` reports, per word, what Whisper heard, how it matched, Whisper's confidence and how far snapping moved it.
- Layout: every element is centered on the frame's center line x = 540 (never on a zone's middle). Critical text and the UI the voice talks about stay inside x 180–900 × y 260–1420; decoration (phone bezel, shadows) may reach x 100–980 × y 200–1500; nothing important in the bottom 500 px. Scenes place their main element with `src/lib/stage.ts`, which vo-check reads too.
- video-check (TW-B01 and other videos without `kit`; the motion kit's rules are below): pauses over 0.35 s (measured in the audio), first word after 0.3 s, a beat more than 3 frames from its cue, a scene's main element more than 8 px off x = 540 or outside its zone, caption pages outside 2–4 words, captions on top of the UI the voice talks about, key UI outside the safe zone, script and narration file out of sync, missing captures, no closing CTA, more than 0.8 s of silence at the end, a batch script outside 75–90 words, text under 4.5:1 contrast, a dark video without the dark endscreen (white wordmark), a CardCrop captured under device scale 3, a KineticText line too wide for the 720 px column (the type shrinks to fit, never under 72 px), a KineticText beat that leaves the screen empty for over 0.3 s waiting for its first word (start the beat on that word). Warnings: pace outside 2.8–3.5 words/s, and any shot that holds longer than 1.5 s without a meaningful change (cut, move inside the phone screen, highlight, cursor action, state switch, light sweep, kinetic word; `src/lib/events.ts`).
- PhoneFrame: a fixed phone (640 px, centered, y 440–1500); scroll and zoom move the capture inside the screen, the bezel never scales. Detail beats cut to CardCrop: the one row or card the voice talks about, cut from the real capture (device scale 3), 720 px wide, centered, with an optional highlight and light sweep. The UI the voice talks about needs text of at least 40 px (names) and 32 px (other text) in the video: captures record the smallest text of every target and vo-check fails below that.
- Captions: one line per page, centered on x = 540, in one band for the whole video: top (y 280–380) when a UI scene fills the middle, otherwise bottom (y 1180–1380); `style.captions` overrides it. A beat can only hide them (`"captions": "none"`), never move them.
- Captures record the page's real width (the site is about 320 px wide at least, so a narrower viewport still produces a wider image): scenes place the image by that width, so the UI is never squeezed and highlights land on their elements.
- Real UI only: PhoneFrame and CardCrop show Playwright captures of the real pages, from the seeded video-capture database only, with every number hidden (save counts, dates, ranks; the capture fails if a digit is still visible), marked "Illustrative". No invented numbers (StatOrQuote refuses digits), no real company names or logos, no music.

## Motion kit

Videos with a `kit` block in their spec follow `docs/video-motion-bible.md`: dark stage, 3D chrome, a twist, and sound built in. `src/kit/` holds the components, `npm run video:gallery` renders all of them to `out/kit/StyleGallery.mp4` with a contact sheet and render times.

- **A spec's `kit`:** the twist word, the track, act 2's length in music beats, the closing sentence and the beats. A beat starts on `{"cue": "word"}` in act 1 or `{"musicBeat": n}` after the drop. Inside props, `{"$cue": "word"}`, `{"$words": "these words"}` and `{"$musicBeat": n}` become frames from the beat's start.
- **Timeline (`src/lib/kit-timeline.ts`):** act 1 plays the voice as recorded and the twist word sets the drop's frame. The CTA, which follows act 1 directly in the recording, is placed after act 2's beats. The music runs from its drop to the end, ducked 11 dB under the voice.
- **Sound:** components don't emit sounds while rendering (Remotion only mounts what's on the current frame, in any order). `src/kit/scenes.ts` lists each component's cues as a pure function; `SoundLayer` plays them and video-check reads the same list. `public/sfx/manifest.json` maps each cue type to its files, source and license. `npm run sfx:synth` generates our own effects; to use a licensed pack, change the manifest entries.
- **Music:** put tracks in `public/music/` with `<track>.license.<ext>` next to them (the audio stays out of git), then `npm run music:analyze` writes `<track>.analysis.json`: beats, drop, loudness. A drop it isn't sure of is reported, never guessed: listen and write `<track>.drop.json` with `{"seconds": n}`.
- **Voice:** `[beat 0.3–1.0]` in a script is a pause on purpose. vo-clean sets it to that length (±40 ms), padding with silence if the reading ran on, and still shortens every other pause over 0.25 s. The style line for AI Studio is `AI_STUDIO_STYLE` in `scripts/lib/kit-check.ts`, and video-check fails if `vo/<ID>.txt` doesn't carry it.
- **Numbers:** `npm run video:facts` reads them from the video-capture database into `src/data/facts.json`. CounterRoll and ChartDraw take a fact's name, and video-check fails on any digit in a spec. These facts are the demo catalog, so a posted video needs production facts first.
- **video-check, before the render:** script length, every pause measured in the audio, cuts within 2 frames of a word or [beat] in act 1 and of a music beat in act 2, a sound on every cut, reveal and [beat], silence before the drop, sound and music licenses, digits and real brand names in the spec's text (a fixed list in `scripts/lib/kit-check.ts`, so a name not on it isn't caught), text that fits the safe column, contrast.
- **video-check, after the render:** the file stays `<ID>.failed.mp4` until it passes: -14 ±1 LUFS, peak under -1 dBTP, under 0.3 s of end silence, the drop measured in the file within 1 frame of the twist word, no frames static for over 0.5 s outside a marked [beat] (measured on a small render without grain, which would otherwise change every frame).
- **`npm run video:selftest`** proves the checks: `music:analyze` against generated tracks with known answers, and one broken video per rule, each of which must fail.
- **3D:** renders use `--gl=angle` (`chromiumOptions.gl`). ThreeCanvas draws from its first child's effect, before `EffectComposer` has built itself, which gives a black first frame: `AfterDraw` in `src/kit/three/ChromeScene.tsx` holds that frame. Reflections are a mirrored copy under the floor, because `MeshReflectorMaterial`'s blur left streaks. Fast spins get sub-frame motion blur on an overlay canvas.
- **References:** `npm run refs:sheets` makes contact sheets and spectrograms of the videos in `refs/` into `out/refs/`. For study only: they stay out of git and out of `public/`, so a render can't reach them.

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
