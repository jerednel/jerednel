// ① IDEATE — topic → title, description, tags, hook, scene-by-scene script.
// Uses the swappable LLM (any provider) with structured output; falls back to
// deterministic mock data when the provider has no credentials.
import { getLLM, llmConfigured } from "../providers/llm.js";
import { BriefSchema, type Brief } from "../schemas.js";
import type { PipelineStateType } from "../state.js";

const SYSTEM = `You are a scriptwriter for a faceless YouTube channel.
Given a topic, produce a tight, retention-optimized short video script.
The hook must earn the first five seconds. Keep narration punchy and factual.`;

export async function ideate(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  const { topic } = state;

  if (llmConfigured()) {
    try {
      const llm = await getLLM();
      const structured = llm.withStructuredOutput(BriefSchema, { name: "brief" });
      const brief = (await structured.invoke([
        { role: "system", content: SYSTEM },
        { role: "user", content: `Topic: ${topic}` },
      ])) as Brief;
      console.log(`  ① ideate → "${brief.title}" (${brief.scenes.length} scenes, live LLM)`);
      return { brief };
    } catch (err) {
      console.warn(`  ⚠ ideate: live LLM failed (${(err as Error).message}); using mock.`);
    }
  }

  const brief = ideateMock(topic);
  console.log(`  ① ideate → "${brief.title}" (${brief.scenes.length} scenes, mock)`);
  return { brief };
}

function ideateMock(topic: string): Brief {
  const beats = [
    { visual: "Slow zoom on a dramatic wide establishing shot", onScreenText: "It started here" },
    { visual: "Close-up detail with cinematic lighting", onScreenText: "But then..." },
    { visual: "Archival-style montage, quick cuts", onScreenText: "Nobody expected this" },
    { visual: "Reveal shot, pull back to show the full picture", onScreenText: "The truth" },
    { visual: "Quiet final frame, subscribe overlay", onScreenText: "Subscribe for more" },
  ];
  return {
    title: `${topic} (You Won't Believe #3)`.slice(0, 70),
    description: `A fast, faceless deep-dive into ${topic}. Sources in the pinned comment. New videos weekly.`,
    tags: [topic, "history", "facts", "top 5", "documentary", "explained", "shorts", "faceless"],
    hook: `Here's what almost nobody tells you about ${topic}.`,
    scenes: beats.map((b, i) => ({
      narration:
        i === 0
          ? `Let's talk about ${topic}. The story is stranger than you think.`
          : `Point ${i}: this is where ${topic} gets genuinely surprising.`,
      visual: b.visual,
      onScreenText: b.onScreenText,
    })),
  };
}
