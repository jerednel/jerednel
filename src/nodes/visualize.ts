// ③ VISUALIZE — each scene → an image/b-roll prompt + a generated asset.
// Real image generation is stubbed behind a provider flag; mock mode renders a
// text-card placeholder so the assemble stage has a real image to work with.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";
import { ffmpegAvailable, renderTextCard } from "../render/ffmpeg.js";
import type { VisualAsset, PipelineStateType } from "../state.js";

export async function visualize(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  const { brief, projectDir } = state;
  if (!brief) return {};

  const useReal =
    (config.image.provider === "flux" || config.image.provider === "auto") && !!config.image.apiKey;

  const assetsDir = join(projectDir, "assets");
  await mkdir(assetsDir, { recursive: true });
  const canRender = await ffmpegAvailable();

  const visuals: VisualAsset[] = [];
  for (let i = 0; i < brief.scenes.length; i++) {
    const scene = brief.scenes[i];
    const prompt = `${scene.visual}. Cinematic, high detail, 16:9, no text, no watermark.`;
    const imagePath = join(assetsDir, `scene-${i}.png`);

    if (useReal) {
      // TODO: call the image provider (Flux via Replicate/fal), write imagePath,
      // set source: "flux". Left as a stub so dry runs stay free.
      visuals.push({ sceneIndex: i, prompt, imagePath: null, source: "flux-stub" });
      continue;
    }

    // Mock: render a placeholder card so assemble produces a real MP4. Swapping
    // in a generated image later changes nothing downstream.
    if (canRender) {
      await renderTextCard(scene.visual, imagePath);
      visuals.push({ sceneIndex: i, prompt, imagePath, source: "mock" });
    } else {
      visuals.push({ sceneIndex: i, prompt, imagePath: null, source: "mock" });
    }
  }

  const rendered = visuals.filter((v) => v.imagePath).length;
  console.log(`  ③ visualize → ${visuals.length} prompts, ${rendered} placeholder cards`);
  return { visuals };
}
