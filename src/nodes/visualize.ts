// ③ VISUALIZE — each scene → an image/b-roll prompt + (real) generated asset.
// Real image generation is stubbed behind a provider flag; mock mode just emits
// the prompt so the render plan has something to reference.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";
import type { VisualAsset, PipelineStateType } from "../state.js";

export async function visualize(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  const { brief, projectDir } = state;
  if (!brief) return {};

  const useReal =
    (config.image.provider === "flux" || config.image.provider === "auto") && !!config.image.apiKey;

  const assetsDir = join(projectDir, "assets");
  await mkdir(assetsDir, { recursive: true });

  const visuals: VisualAsset[] = brief.scenes.map((scene, i) => {
    const prompt = `${scene.visual}. Cinematic, high detail, 16:9, no text, no watermark.`;
    return {
      sceneIndex: i,
      prompt,
      imagePath: null,
      source: "mock",
    };
  });

  if (useReal) {
    // TODO: call the image provider (e.g. Flux via Replicate/fal) here and set
    // imagePath + source. Left as a stub so the pipeline stays runnable dry.
    console.log(`  ③ visualize → ${visuals.length} prompts (image provider stub: wire Flux here)`);
  } else {
    console.log(`  ③ visualize → ${visuals.length} prompts (mock)`);
  }

  return { visuals };
}
