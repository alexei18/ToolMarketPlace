/*
 * npm run video:voice <ID> [--engine kokoro|elevenlabs] [--force]
 * Makes vo/<ID>.wav from the narration in vo/<ID>.txt when you don't provide a recording:
 * ElevenLabs when ELEVENLABS_API_KEY is set, otherwise Kokoro (local, free, for tests only).
 * A recording you dropped in is never overwritten unless you pass --force.
 */
import { existsSync, writeFileSync } from "node:fs";
import { fail, idArg, loadNarration, paths, wavHeader } from "./lib/common";

const id = idArg();
const force = process.argv.includes("--force");
const engineArg = process.argv[process.argv.indexOf("--engine") + 1];
const engine = process.argv.includes("--engine") ? engineArg : process.env.ELEVENLABS_API_KEY ? "elevenlabs" : "kokoro";
const out = paths.voRaw(id);

if (existsSync(out) && !force) fail(`${out} already exists (your recording?). Pass --force to replace it.`);
// [beat] marks are for vo-clean, not for a voice that would read them out.
const text = loadNarration(id).replace(/\[beat\s+[\d.]+\]/g, " ").replace(/\s+/g, " ").trim();

if (engine === "elevenlabs") {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) fail("ELEVENLABS_API_KEY is not set");
  // One voice for the whole batch (docs/tiktok-campaign.md); set ELEVENLABS_VOICE_ID to the chosen one.
  const voice = process.env.ELEVENLABS_VOICE_ID;
  if (!voice) fail("Set ELEVENLABS_VOICE_ID to the voice used for the whole batch");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=pcm_24000`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2" }),
  });
  if (!res.ok) fail(`ElevenLabs answered ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const pcm = Buffer.from(await res.arrayBuffer());
  writeFileSync(out, Buffer.concat([wavHeader(pcm.length, 24000, 1, 16), pcm]));
  console.log(`✔ ElevenLabs voice ${voice} → ${out}`);
} else if (engine === "kokoro") {
  const { KokoroTTS } = await import("kokoro-js");
  const voice = process.env.KOKORO_VOICE ?? "af_heart";
  console.log(`Kokoro (${voice}) — test voice only. Downloading the model on first use…`);
  const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
  const audio = await tts.generate(text, { voice: voice as "af_heart" });
  await audio.save(out);
  console.log(`✔ Kokoro voice ${voice} → ${out}`);
} else {
  fail(`Unknown engine "${engine}" (kokoro or elevenlabs)`);
}
