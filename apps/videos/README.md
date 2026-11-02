# Tryworthy TikTok videos

Remotion project for the campaign in `docs/tiktok-campaign.md`. Standalone npm package (not a bun
workspace): `cd apps/videos && npm install` once. Needs ffmpeg/ffprobe on PATH (or `FFMPEG_PATH`,
`FFPROBE_PATH`).

## One video

1. `specs/<ID>.json`: id, concept, script, beats (each starts on its cue word: `"save"` or `"save#2"`), style, endscreen, cover, captures.
2. `vo/<ID>.txt`: the style instruction for Google AI Studio, a line `---`, then the exact narration (same words as the spec's script).
3. `vo/<ID>.wav`: your recording, or `npm run video:voice <ID>` (ElevenLabs when `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` are set, Kokoro otherwise, for tests only). Existing recordings are never overwritten without `--force`.
4. `npm run video:capture <ID>`: real pages from the local site for UI scenes (the site must not be in waitlist mode, see below).
5. `npm run video:prepare <ID>`: vo-clean → vo-align → vo-check. Report in `out/checks/<ID>.vo-check.md`.
6. `npm run video:render <ID>`: blocked until the latest vo-check passed. Writes `out/[<batch>/]<ID>.mp4`, `<ID>.cover.png` (the cover frame) and `out/checks/<ID>-beat<N>.png` (real page | video frame) for every UI scene.

`npm run video:batch <BATCH>` prepares and renders every spec of a batch. `npm run studio` opens Remotion Studio (the `SceneGallery` composition previews all scenes; set `debugSafeZone` to see the layout zones, the center line, caption boxes and focus areas).

## Rules the pipeline enforces

- The voice is the clock: beats start on their cue words, the video ends 0.15 s after the last word plus the 2 s endscreen. No hard-coded durations.
- vo-clean: trims the ends, cuts pauses over 0.25 s to 0.18 s (only inside silence), atempo 1.05–1.10 below 2.6 words/s, -14 LUFS, -1.5 dBTP.
- vo-align: Whisper (whisper.cpp in `.whisper/`, model `WHISPER_MODEL`, default `small.en`) one word per segment, boundaries snapped to the audio; any word that differs from the script fails.
- Layout: every element is centered on the frame's center line x = 540 (never on a zone's middle). Critical text and the UI the voice talks about stay inside x 180–900 × y 260–1420; decoration (phone bezel, shadows) may reach x 100–980 × y 200–1500; nothing important in the bottom 500 px. Scenes place their main element with `src/lib/stage.ts`, which vo-check reads too.
- vo-check: pauses over 0.35 s (measured in the audio), first word after 0.3 s, a beat more than 3 frames from its cue, a scene's main element more than 8 px off x = 540 or outside its zone, caption pages outside 2–4 words, captions on top of the UI the voice talks about, key UI outside the safe zone, script and narration file out of sync, missing captures.
- PhoneFrame: a fixed phone (640 px, centered, y 440–1500); scroll and zoom move the capture inside the screen, the bezel never scales. Detail beats cut to CardCrop: the one row or card the voice talks about, cut from the real capture, 720 px wide, centered. The UI the voice talks about needs text of at least 40 px (names) and 32 px (other text) in the video: captures record the smallest text of every target and vo-check fails below that.
- Captions: one line per page, centered on x = 540, in one band for the whole video: top (y 280–380) when a UI scene fills the middle, otherwise bottom (y 1180–1380); `style.captions` overrides it. A beat can only hide them (`"captions": "none"`), never move them.
- Real UI only: PhoneFrame and CardCrop show Playwright captures of the real pages (`captures` recipes keep only listed demo products and can hide counts), marked "Illustrative". No invented numbers (StatOrQuote refuses digits), no real company names or logos, no music.

## Captures and waitlist mode

While the site runs as the waitlist, catalog pages redirect. Before capturing on the local test stack, mark it launched, and set it back afterwards:

```sh
docker exec -w /app/apps/api toolmarket-test-app-1 bunx wrangler d1 execute DB --local --command "UPDATE site_state SET launched_at = 1 WHERE id = 1"
# …npm run video:capture <ID>…
docker exec -w /app/apps/api toolmarket-test-app-1 bunx wrangler d1 execute DB --local --command "UPDATE site_state SET launched_at = NULL WHERE id = 1"
```
