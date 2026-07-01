// Entrypoint: `tsx src/cli.ts "<topic>"`
// Runs the full LangGraph pipeline and writes a project folder to out/<slug>/.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config, slugify } from "./config.js";
import { buildGraph } from "./graph.js";
import type { Brief } from "./schemas.js";

async function main() {
  const topic = process.argv.slice(2).join(" ").trim();
  if (!topic) {
    console.error('Usage: tsx src/cli.ts "<video topic>"');
    process.exit(1);
  }

  const slug = slugify(topic) || "video";
  const projectDir = join(config.outDir, slug);
  await mkdir(projectDir, { recursive: true });

  console.log(`\n▶ faceless-yt: "${topic}"`);
  console.log(`  provider: ${config.llm.provider} / ${config.llm.model}`);
  console.log(`  output:   out/${slug}/\n`);

  const graph = buildGraph();
  const final = await graph.invoke({ topic, slug, projectDir });

  // Persist the full project for review/editing.
  await writeFile(join(projectDir, "project.json"), JSON.stringify(final, null, 2));
  if (final.brief) await writeFile(join(projectDir, "script.md"), renderScript(final.brief));

  console.log(`\n✔ done → out/${slug}/`);
  console.log(`  project.json  full structured project`);
  console.log(`  script.md     human-readable script`);
  console.log(`  render.sh     ffmpeg render plan\n`);
}

function renderScript(brief: Brief): string {
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
