import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const config = {
  projectRoot: join(__dirname, ".."),
  outDir: join(__dirname, "..", "out"),

  // ① ideate — LLM provider is swappable via these two values.
  //   provider: "anthropic" | "openai" | "google-genai" | ...
  //   Change them (or the env) to swap models with zero code changes.
  llm: {
    provider: process.env.LLM_PROVIDER || "anthropic",
    model: process.env.LLM_MODEL || "claude-sonnet-5",
  },

  // ② narrate — text-to-speech
  tts: {
    provider: process.env.TTS_PROVIDER || "auto", // "elevenlabs" | "mock" | "auto"
    elevenLabsKey: process.env.ELEVENLABS_API_KEY || "",
    elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID || "",
  },

  // ③ visualize — image / b-roll generation
  image: {
    provider: process.env.IMAGE_PROVIDER || "auto", // "flux" | "mock" | "auto"
    apiKey: process.env.IMAGE_API_KEY || "",
  },

  // ⑤ publish — YouTube
  youtube: {
    provider: process.env.PUBLISH_PROVIDER || "auto", // "youtube" | "mock" | "auto"
    clientId: process.env.YOUTUBE_CLIENT_ID || "",
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET || "",
    refreshToken: process.env.YOUTUBE_REFRESH_TOKEN || "",
  },
};

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
