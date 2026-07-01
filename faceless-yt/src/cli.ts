// Entrypoint. Three modes:
//   tsx src/cli.ts "<topic>"          full pipeline (script → render)
//   tsx src/cli.ts script "<topic>"   script/brief only (cheap "propose" phase)
//   tsx src/cli.ts render "<slug>"    render an approved project
import { config } from "./config.js";
import { buildGraph } from "./graph.js";
import { runScript, runProduction, prepareProject } from "./pipeline.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderScript } from "./pipeline.js";

async function main() {
  const [maybeCmd, ...rest] = process.argv.slice(2);
  const cmd = maybeCmd === "script" || maybeCmd === "render" ? maybeCmd : null;
  const arg = (cmd ? rest.join(" ") : [maybeCmd, ...rest].join(" ")).trim();

  if (!arg) {
    console.error('Usage: tsx src/cli.ts ["<topic>" | script "<topic>" | render "<slug>"]');
    process.exit(1);
  }

  if (cmd === "script") return void (await scriptMode(arg));
  if (cmd === "render") return void (await renderMode(arg));
  return void (await fullMode(arg));
}

async function scriptMode(topic: string) {
  console.log(`\n▶ script: "${topic}"  (${config.llm.provider}/${config.llm.model})`);
  const state = await runScript(topic);
  console.log(`\n✔ script ready → out/${state.slug}/  (review, then render)`);
}

async function renderMode(slug: string) {
  console.log(`\n▶ render: "${slug}"`);
  const state = await runProduction(slug);
  console.log(`\n✔ rendered → out/${state.slug}/video.mp4`);
}

async function fullMode(topic: string) {
  const { slug, projectDir } = await prepareProject(topic);
  console.log(`\n▶ faceless-yt: "${topic}"`);
  console.log(`  provider: ${config.llm.provider} / ${config.llm.model}`);
  console.log(`  output:   out/${slug}/\n`);

  const graph = buildGraph();
  const final = await graph.invoke({ topic, slug, projectDir });

  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, "project.json"), JSON.stringify(final, null, 2));
  if (final.brief) await writeFile(join(projectDir, "script.md"), renderScript(final.brief));

  console.log(`\n✔ done → out/${slug}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
