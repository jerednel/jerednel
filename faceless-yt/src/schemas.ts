import { z } from "zod";

export const SceneSchema = z.object({
  narration: z.string().describe("What the voiceover says (1-3 sentences)."),
  visual: z.string().describe("Description of the image/b-roll to show."),
  onScreenText: z.string().describe("Short caption/overlay text, <= 6 words."),
});

export const BriefSchema = z.object({
  title: z.string().describe("High-CTR title, <= 70 chars, no clickbait lies."),
  description: z.string().describe("2-3 sentence YouTube description."),
  tags: z.array(z.string()).describe("8-12 search tags."),
  hook: z.string().describe("The first spoken line; must earn the next 5 seconds."),
  scenes: z.array(SceneSchema).min(4).max(8).describe("4-8 scenes."),
});

export type Scene = z.infer<typeof SceneSchema>;
export type Brief = z.infer<typeof BriefSchema>;
