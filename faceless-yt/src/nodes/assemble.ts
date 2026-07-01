// ④ ASSEMBLE — scenes + narration + visuals → a final video.mp4.
// When ffmpeg and per-scene assets are present, this renders each scene (image
// held for the narration duration, caption overlaid) and concatenates them.
// Otherwise it falls back to writing a plan-only render.sh.
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  ffmpegAvailable,
  renderScene,
  concatScenes,
} from "../render/ffmpeg.js";
import type { RenderPlan, PipelineStateType } from "../state.js";

export async function assemble(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  const { brief, narration, visuals, projectDir } = state;
  if (!brief) return {};

  const assetsDir = join(projectDir, "assets");
  await mkdir(assetsDir, { recursive: true });
  const outputPath = join(projectDir, "video.mp4");
  const ffmpegScriptPath = join(projectDir, "render.sh");
  const ffmpegOk = await ffmpegAvailable();

  // A scene is renderable only if both its image and audio exist on disk.
  const renderable = brief.scenes.every((_, i) => {
    const img = visuals[i]?.imagePath;
    const aud = narration[i]?.audioPath;
    return !!img && existsSync(img) && !!aud && existsSync(aud);
  });

  if (ffmpegOk && renderable) {
    const scenePaths: string[] = [];
    for (let i = 0; i < brief.scenes.length; i++) {
      const scenePath = join(assetsDir, `scene-clip-${i}.mp4`);
      await renderScene({
        imagePath: visuals[i].imagePath!,
        audioPath: narration[i].audioPath!,
        onScreenText: brief.scenes[i].onScreenText,
        outPath: scenePath,
      });
      scenePaths.push(scenePath);
    }
    await concatScenes(scenePaths, outputPath);
    const secs = narration.reduce((s, n) => s + n.durationSec, 0);
    console.log(`  ④ assemble → rendered video.mp4 (${brief.scenes.length} scenes, ~${secs.toFixed(1)}s)`);
    return {
      renderPlan: { outputPath, ffmpegScriptPath, ffmpegAvailable: true },
    };
  }

  // Fallback: write an annotated plan the operator can run once assets exist.
  await writePlan(ffmpegScriptPath, brief, narration, visuals);
  const why = !ffmpegOk ? "ffmpeg not installed" : "some scene assets missing";
  console.log(`  ④ assemble → render.sh plan only (${why})`);
  return {
    renderPlan: { outputPath, ffmpegScriptPath, ffmpegAvailable: ffmpegOk },
  };
}

async function writePlan(
  path: string,
  brief: NonNullable<PipelineStateType["brief"]>,
  narration: PipelineStateType["narration"],
  visuals: PipelineStateType["visuals"],
): Promise<void> {
  const lines: string[] = [
    "#!/usr/bin/env bash",
    "# Auto-generated render plan. Fill in any missing assets, then run.",
    "set -euo pipefail",
    `cd "$(dirname "$0")"`,
    "",
  ];
  brief.scenes.forEach((scene, i) => {
    const n = narration[i];
    const v = visuals[i];
    const img = v?.imagePath ? `assets/scene-${i}.png` : `# MISSING image: ${v?.prompt}`;
    const audio = n?.audioPath ? `assets/narration-${i}.mp3` : `# MISSING audio for scene ${i}`;
    lines.push(`# --- scene ${i} (${n?.durationSec ?? 5}s) ---`);
    lines.push(`# on-screen text: ${scene.onScreenText}`);
    lines.push(`# image:  ${img}`);
    lines.push(`# audio:  ${audio}`);
    lines.push("");
  });
  await writeFile(path, lines.join("\n"), { mode: 0o755 });
}
