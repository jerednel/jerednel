// Project lifecycle helpers shared by the CLI and the web server. A "project"
// is a folder under out/<slug>/ holding project.json (the structured state),
// script.md, assets, and the final video.mp4.
import { mkdir, writeFile, readFile, readdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config, slugify } from "./config.js";
import { buildScriptGraph, buildProductionGraph } from "./graph.js";
import type { Brief } from "./schemas.js";
import type { PipelineStateType } from "./state.js";

export interface ProjectSummary {
  slug: string;
  title: string;
  topic: string;
  scenes: number;
  hasVideo: boolean;
  status: "draft" | "rendered";
  createdAt: number;
}

function projectDirFor(slug: string): string {
  return join(config.outDir, slug);
}

export async function prepareProject(topic: string): Promise<{ slug: string; projectDir: string }> {
  const slug = slugify(topic) || "video";
  const projectDir = projectDirFor(slug);
  await mkdir(projectDir, { recursive: true });
  return { slug, projectDir };
}

/** Cheap "propose" phase: generate the script/brief only, persist it. */
export async function runScript(topic: string): Promise<PipelineStateType> {
  const { slug, projectDir } = await prepareProject(topic);
  const graph = buildScriptGraph();
  const state = (await graph.invoke({ topic, slug, projectDir })) as PipelineStateType;
  await persist(state);
  return state;
}

/** Expensive phase: run voice + images + render from the (approved) brief. */
export async function runProduction(slug: string): Promise<PipelineStateType> {
  const projectDir = projectDirFor(slug);
  const saved = await loadProject(slug);
  if (!saved?.brief) throw new Error(`no script found for "${slug}" — run script first`);
  const graph = buildProductionGraph();
  const state = (await graph.invoke({
    topic: saved.topic,
    slug,
    projectDir,
    brief: saved.brief,
  })) as PipelineStateType;
  await persist({ ...saved, ...state });
  return state;
}

/** Overwrite the stored brief (used by the review/edit step before render). */
export async function updateBrief(slug: string, brief: Brief): Promise<void> {
  const saved = await loadProject(slug);
  if (!saved) throw new Error(`unknown project "${slug}"`);
  await persist({ ...saved, brief });
}

async function persist(state: PipelineStateType): Promise<void> {
  const projectDir = projectDirFor(state.slug);
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, "project.json"), JSON.stringify(state, null, 2));
  if (state.brief) await writeFile(join(projectDir, "script.md"), renderScript(state.brief));
}

export async function loadProject(slug: string): Promise<PipelineStateType | null> {
  const file = join(projectDirFor(slug), "project.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, "utf8")) as PipelineStateType;
  } catch {
    return null;
  }
}

export async function listProjects(): Promise<ProjectSummary[]> {
  if (!existsSync(config.outDir)) return [];
  const entries = await readdir(config.outDir, { withFileTypes: true });
  const out: ProjectSummary[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const state = await loadProject(e.name);
    if (!state?.brief) continue;
    const videoPath = join(projectDirFor(e.name), "video.mp4");
    const hasVideo = existsSync(videoPath);
    let createdAt = 0;
    try {
      createdAt = (await stat(join(projectDirFor(e.name), "project.json"))).mtimeMs;
    } catch {
      /* ignore */
    }
    out.push({
      slug: e.name,
      title: state.brief.title,
      topic: state.topic,
      scenes: state.brief.scenes.length,
      hasVideo,
      status: hasVideo ? "rendered" : "draft",
      createdAt,
    });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteProject(slug: string): Promise<void> {
  await rm(projectDirFor(slug), { recursive: true, force: true });
}

export function renderScript(brief: Brief): string {
  const lines = [
    `# ${brief.title}`,
    "",
    `**Description:** ${brief.description}`,
    "",
    `**Tags:** ${brief.tags.join(", ")}`,
    "",
    `**Hook:** ${brief.hook}`,
    "",
    "## Scenes",
    "",
  ];
  brief.scenes.forEach((s, i) => {
    lines.push(`### Scene ${i + 1}`);
    lines.push(`- **Narration:** ${s.narration}`);
    lines.push(`- **Visual:** ${s.visual}`);
    lines.push(`- **On-screen:** ${s.onScreenText}`);
    lines.push("");
  });
  return lines.join("\n");
}
