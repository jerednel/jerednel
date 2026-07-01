// ④ ASSEMBLE — turn scenes + narration + visuals into a render plan and emit a
// runnable ffmpeg script. Detects whether ffmpeg is installed; either way the
// script is written so it can be run wherever ffmpeg is available.
import { writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import type { RenderPlan, PipelineStateType } from "../state.js";

const exec = promisify(execFile);

async function hasFfmpeg(): Promise<boolean> {
  try {
    await exec("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

export async function assemble(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  const { brief, narration, visuals, projectDir } = state;
  if (!brief) return {};

  const assetsDir = join(projectDir, "assets");
  await mkdir(assetsDir, { recursive: true });
  const outputPath = join(projectDir, "video.mp4");
  const ffmpegScriptPath = join(projectDir, "render.sh");
  const ffmpegAvailable = await hasFfmpeg();

  // Build a per-scene concat plan. Each scene = one image shown for the
  // narration duration, with its audio track. Missing assets are annotated so
  // the operator knows what to drop in before running.
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
    const img = v?.imagePath ? `assets/scene-${i}.png` : `# MISSING image for scene ${i}: ${v?.prompt}`;
    const audio = n?.audioPath ? `assets/narration-${i}.mp3` : `# MISSING audio for scene ${i}`;
    lines.push(`# --- scene ${i} (${n?.durationSec ?? 5}s) ---`);
    lines.push(`# on-screen text: ${scene.onScreenText}`);
    lines.push(`# image:  ${img}`);
    lines.push(`# audio:  ${audio}`);
    lines.push("");
  });

  lines.push(
    "# Once assets exist, concat per-scene clips into video.mp4 with ffmpeg,",
    "# e.g. build each scene with:",
    "#   ffmpeg -loop 1 -i assets/scene-$I.png -i assets/narration-$I.mp3 \\",
    "#     -c:v libx264 -tune stillimage -c:a aac -shortest -pix_fmt yuv420p scene-$I.mp4",
    "# then concat all scene-*.mp4 into video.mp4.",
    "",
  );

  await writeFile(ffmpegScriptPath, lines.join("\n"), { mode: 0o755 });

  const renderPlan: RenderPlan = { outputPath, ffmpegScriptPath, ffmpegAvailable };
  console.log(
    `  ④ assemble → render.sh written (ffmpeg ${ffmpegAvailable ? "detected" : "NOT installed — plan only"})`,
  );
  return { renderPlan };
}
