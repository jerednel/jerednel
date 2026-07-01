// ③ VISUALIZE — each scene → an image/b-roll prompt + a generated asset.
// Real path: Replicate (Flux) via the image provider. Mock path: a text-card
// placeholder rendered with ffmpeg. Both write the same imagePath, so assemble
// is agnostic to which one ran.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";
import { ffmpegAvailable, renderTextCard } from "../render/ffmpeg.js";
import { generateImage } from "../providers/image.js";
import type { VisualAsset, PipelineStateType } from "../state.js";

export async function visualize(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  const { brief, projectDir } = state;
  if (!brief) return {};

  const useReal =
    config.image.provider === "openai"
      ? !!process.env.OPENAI_API_KEY
      : (config.image.provider === "replicate" || config.image.provider === "auto") &&
        !!config.image.apiKey;

  const assetsDir = join(projectDir, "assets");
  await mkdir(assetsDir, { recursive: true });
  const canRender = await ffmpegAvailable();

  const visuals: VisualAsset[] = [];
  let real = 0;
  let cards = 0;
  for (let i = 0; i < brief.scenes.length; i++) {
    const scene = brief.scenes[i];
    const prompt = `${scene.visual}. Cinematic, high detail, 16:9, no text, no watermark.`;
    const imagePath = join(assetsDir, `scene-${i}.png`);

    if (useReal) {
      try {
        const png = await generateImage(prompt);
        await writeFile(imagePath, png);
        visuals.push({ sceneIndex: i, prompt, imagePath, source: config.image.provider });
        real++;
        continue;
      } catch (err) {
        console.warn(`  ⚠ visualize scene ${i}: image gen failed (${(err as Error).message}); card.`);
      }
    }

    // Fallback: placeholder card so assemble still produces a real MP4.
    if (canRender) {
      await renderTextCard(scene.visual, imagePath);
      visuals.push({ sceneIndex: i, prompt, imagePath, source: "mock" });
      cards++;
    } else {
      visuals.push({ sceneIndex: i, prompt, imagePath: null, source: "mock" });
    }
  }

  const label = config.image.provider === "openai" ? config.image.model : config.image.provider;
  console.log(`  ③ visualize → ${visuals.length} scenes (${real} ${label}, ${cards} cards)`);
  return { visuals };
}
