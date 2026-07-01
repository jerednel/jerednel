// ffmpeg render primitives. All calls use execFile with argument arrays (no
// shell) and pass rendered text via textfile= to avoid escaping. The scene
// renderer does the "faceless YouTube" look: crop-to-fill 16:9, a slow Ken
// Burns zoom on the still, and a styled caption. Real and mock assets flow
// through the identical scene/concat path.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
    maxBuffer: 1024 * 1024 * 64,
  });
}

/** Actual media duration in seconds (used to sync video length to narration). */
export async function probeDuration(path: string): Promise<number> {
  const { stdout } = await exec("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    path,
  ]);
  const d = parseFloat(stdout.trim());
  return Number.isFinite(d) ? d : 0;
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
    `fontcolor=white:fontsize=52:line_spacing=14:x=(w-text_w)/2:y=(h-text_h)/2`;
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

/**
 * One scene: image cropped to fill 16:9, slow Ken Burns zoom, caption overlay,
 * held for exactly the audio's length. Alternating zoom direction per scene
 * index keeps a multi-scene video from feeling mechanical.
 */
export async function renderScene(opts: {
  imagePath: string;
  audioPath: string;
  onScreenText: string;
  index: number;
  outPath: string;
}): Promise<void> {
  const { width, height, fps, fontFile } = config.video;
  const dur = (await probeDuration(opts.audioPath)) || 4;
  const frames = Math.max(1, Math.round(dur * fps));
  const step = (0.18 / frames).toFixed(6);

  // Even scenes zoom in; odd scenes zoom out — subtle variety.
  const zoomExpr =
    opts.index % 2 === 0
      ? `min(zoom+${step},1.18)`
      : `if(eq(on,0),1.18,max(zoom-${step},1.0))`;

  const captionFile = opts.outPath + ".caption.txt";
  await mkdir(dirname(opts.outPath), { recursive: true });
  await writeFile(captionFile, wrap(opts.onScreenText, 40));

  const filter =
    `[0:v]scale=2560:1440:force_original_aspect_ratio=increase,crop=2560:1440,` +
    `zoompan=z='${zoomExpr}':d=${frames}:s=${width}x${height}:fps=${fps},` +
    `drawtext=fontfile=${fontFile}:textfile=${captionFile}:` +
    `fontcolor=white:fontsize=72:borderw=3:bordercolor=black@0.9:` +
    `box=1:boxcolor=black@0.45:boxborderw=28:x=(w-text_w)/2:y=h-text_h-80[v]`;

  await run([
    "-i", opts.imagePath,
    "-i", opts.audioPath,
    "-filter_complex", filter,
    "-map", "[v]",
    "-map", "1:a",
    "-t", String(dur),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-r", String(fps),
    "-c:a", "aac",
    "-b:a", "128k",
    "-shortest",
    opts.outPath,
  ]);
}

/** Concatenate scene clips, with a short fade from/to black at the ends. */
export async function concatScenes(scenePaths: string[], outPath: string): Promise<void> {
  const { fps } = config.video;
  const present = scenePaths.filter((p) => existsSync(p));
  const listPath = outPath + ".concat.txt";
  // Absolute paths so the concat demuxer doesn't resolve them relative to the
  // list file's own directory.
  const body = present.map((p) => `file '${resolve(p).replace(/'/g, "'\\''")}'`).join("\n");
  await writeFile(listPath, body);

  // Total duration for the fade-out start point.
  let total = 0;
  for (const p of present) total += await probeDuration(p);
  const fadeOutStart = Math.max(0, total - 0.5);

  await run([
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-vf", `fade=t=in:st=0:d=0.4,fade=t=out:st=${fadeOutStart.toFixed(2)}:d=0.5`,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-r", String(fps),
    "-c:a", "aac",
    "-b:a", "128k",
    outPath,
  ]);
}

/** Mix a looped background music bed under the narration, then replace video. */
export async function mixMusic(videoPath: string, musicPath: string, outPath: string): Promise<void> {
  await run([
    "-i", videoPath,
    "-stream_loop", "-1",
    "-i", musicPath,
    "-filter_complex",
    `[1:a]volume=${config.video.musicVolume}[bg];` +
      `[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0[a]`,
    "-map", "0:v",
    "-map", "[a]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "160k",
    "-shortest",
    outPath,
  ]);
}
