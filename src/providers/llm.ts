// The provider-swap seam. Every LLM call in the pipeline goes through here,
// so switching Anthropic → OpenAI → Google is a config change, never a code
// change. `initChatModel` returns a unified chat model regardless of vendor.
import { initChatModel } from "langchain/chat_models/universal";
import { config } from "../config.js";

let cached: Awaited<ReturnType<typeof initChatModel>> | null = null;

export async function getLLM() {
  if (cached) return cached;
  cached = await initChatModel(config.llm.model, {
    modelProvider: config.llm.provider,
    temperature: 0.8,
  });
  return cached;
}

/** True when the selected provider has credentials available. */
export function llmConfigured(): boolean {
  const p = config.llm.provider;
  if (p === "anthropic") return !!process.env.ANTHROPIC_API_KEY;
  if (p === "openai") return !!process.env.OPENAI_API_KEY;
  if (p === "google-genai") return !!process.env.GOOGLE_API_KEY;
  // Unknown provider: assume the user wired it up.
  return true;
}
