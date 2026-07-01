// Thin ffmpeg wrapper. All calls use execFile with argument arrays (no shell),
// and all rendered text is passed via textfile= to sidestep escaping. These are
// the primitives every render stage shares — real assets and mock placeholders
// flow through the exact same scene/concat path.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";

const exec = promisify(execFile);

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await exec("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

async function run(args: string[]): Promise<void> {
  await exec("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], {
    maxBuffer: 1024 * 1024 * 32,
  });
}

// Wrap long text to ~charsPerLine so drawtext (which does not auto-wrap) reads.
function wrap(text: string, charsPerLine = 34): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > charsPerLine) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

/** A solid-color placeholder card with centered text — stands in for real b-roll. */
export async function renderTextCard(text: string, outPath: string): Promise<void> {
  const { width, height, fontFile } = config.video;
  const textFile = outPath + ".txt";
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(textFile, wrap(text));
  const draw =
    `drawtext=fontfile=${fontFile}:textfile=${textFile}:` +
    `fontcolor=white:fontsize=52:line_spacing=14:` +
    `x=(w-text_w)/2:y=(h-text_h)/2`;
  await run([
    "-f", "lavfi",
    "-i", `color=c=0x111827:s=${width}x${height}:d=1`,
    "-vf", draw,
    "-frames:v", "1",
    outPath,
  ]);
}

/** Silent audio of a given duration — placeholder for a real TTS clip. */
export async function renderSilentAudio(durationSec: number, outPath: string): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true });
  await run([
    "-f", "lavfi",
    "-i", "anullsrc=r=44100:cl=stereo",
    "-t", String(durationSec),
    "-c:a", "libmp3lame",
    "-b:a", "128k",
    outPath,
  ]);
}

/** One scene = image held for the audio's length, with a caption overlay. */
export async function renderScene(opts: {
  imagePath: string;
  audioPath: string;
  onScreenText: string;
  outPath: string;
}): Promise<void> {
  const { width, height, fps, fontFile } = config.video;
  const captionFile = opts.outPath + ".caption.txt";
  await mkdir(dirname(opts.outPath), { recursive: true });
  await writeFile(captionFile, wrap(opts.onScreenText, 40));
  const vf =
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x111827,` +
    `drawtext=fontfile=${fontFile}:textfile=${captionFile}:` +
    `fontcolor=white:fontsize=64:box=1:boxcolor=black@0.55:boxborderw=24:` +
    `x=(w-text_w)/2:y=h-text_h-90`;
  await run([
    "-loop", "1",
    "-i", opts.imagePath,
    "-i", opts.audioPath,
    "-vf", vf,
    "-c:v", "libx264",
    "-tune", "stillimage",
    "-pix_fmt", "yuv420p",
    "-r", String(fps),
    "-c:a", "aac",
    "-b:a", "128k",
    "-shortest",
    opts.outPath,
  ]);
}

/** Concatenate encoded scene clips into the final video (re-encode for safety). */
export async function concatScenes(scenePaths: string[], outPath: string): Promise<void> {
  const { fps } = config.video;
  const listPath = outPath + ".concat.txt";
  const body = scenePaths
    .filter((p) => existsSync(p))
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");
  await writeFile(listPath, body);
  await run([
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-r", String(fps),
    "-c:a", "aac",
    "-b:a", "128k",
    outPath,
  ]);
}
