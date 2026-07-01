// ② NARRATE — script → per-scene voiceover audio + timing.
// Real: ElevenLabs TTS. Mock: estimates duration from word count, no audio file.
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";
import { ffmpegAvailable, renderSilentAudio } from "../render/ffmpeg.js";
import type { NarrationAsset, PipelineStateType } from "../state.js";

const WORDS_PER_SECOND = 2.6; // ~155 wpm narration pace

function estimateDuration(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(2, Math.round((words / WORDS_PER_SECOND) * 10) / 10);
}

export async function narrate(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  const { brief, projectDir } = state;
  if (!brief) return {};

  const useReal =
    (config.tts.provider === "elevenlabs" || config.tts.provider === "auto") &&
    !!config.tts.elevenLabsKey &&
    !!config.tts.elevenLabsVoiceId;

  const assetsDir = join(projectDir, "assets");
  await mkdir(assetsDir, { recursive: true });
  const canRender = await ffmpegAvailable();

  const narration: NarrationAsset[] = [];
  for (let i = 0; i < brief.scenes.length; i++) {
    const scene = brief.scenes[i];
    const durationSec = estimateDuration(scene.narration);
    const audioPath = join(assetsDir, `narration-${i}.mp3`);

    if (useReal) {
      try {
        const buf = await elevenLabsTTS(scene.narration);
        await writeFile(audioPath, buf);
        narration.push({ sceneIndex: i, audioPath, durationSec, source: "elevenlabs" });
        continue;
      } catch (err) {
        console.warn(`  ⚠ narrate scene ${i}: TTS failed (${(err as Error).message}); mock.`);
      }
    }

    // Mock: emit a real silent clip at the estimated duration so the render
    // path is identical to the real one (swap in TTS audio, nothing else changes).
    if (canRender) {
      await renderSilentAudio(durationSec, audioPath);
      narration.push({ sceneIndex: i, audioPath, durationSec, source: "mock" });
    } else {
      narration.push({ sceneIndex: i, audioPath: null, durationSec, source: "mock" });
    }
  }

  const total = narration.reduce((s, n) => s + n.durationSec, 0);
  const src = narration[0]?.source ?? "mock";
  console.log(`  ② narrate → ${narration.length} clips, ~${total.toFixed(1)}s total (${src})`);
  return { narration };
}

async function elevenLabsTTS(text: string): Promise<Buffer> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${config.tts.elevenLabsVoiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": config.tts.elevenLabsKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
