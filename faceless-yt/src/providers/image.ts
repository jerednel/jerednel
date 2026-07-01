// Image provider adapter. Dispatches on config.image.provider so swapping hosts
// is a config change. Given a prompt, returns PNG bytes for a ~16:9 image.
//   - "openai":     gpt-image-1 (falls back to dall-e-3), uses OPENAI_API_KEY
//   - "replicate":  Flux models, uses IMAGE_API_KEY
import { config } from "../config.js";

/** Generate one ~16:9 image for `prompt` and return the raw PNG bytes. */
export async function generateImage(prompt: string): Promise<Buffer> {
  const provider = config.image.provider;
  if (provider === "openai") return openaiImage(prompt);
  if (provider === "replicate") return replicateImage(prompt);
  // "auto": prefer OpenAI if its key is present, else Replicate.
  if (process.env.OPENAI_API_KEY) return openaiImage(prompt);
  return replicateImage(prompt);
}

// ── OpenAI ──────────────────────────────────────────────────────────
async function openaiImage(prompt: string): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const model = config.image.model.startsWith("gpt-image") ? config.image.model : "gpt-image-1";

  try {
    return await openaiGenerate(key, model, prompt, "1536x1024");
  } catch (err) {
    // gpt-image-1 can require org verification; dall-e-3 is broadly available.
    console.warn(`  ⚠ ${model} failed (${(err as Error).message}); trying dall-e-3.`);
    return openaiGenerate(key, "dall-e-3", prompt, "1792x1024");
  }
}

async function openaiGenerate(
  key: string,
  model: string,
  prompt: string,
  size: string,
): Promise<Buffer> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, prompt, size, n: 1 }),
  });
  if (!res.ok) throw new Error(`OpenAI images HTTP ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const item = data.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item?.url) {
    const img = await fetch(item.url);
    if (!img.ok) throw new Error(`image download HTTP ${img.status}`);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error("no image in OpenAI response");
}

// ── Replicate (Flux) ────────────────────────────────────────────────
const REPLICATE_BASE = "https://api.replicate.com/v1";

async function replicateImage(prompt: string): Promise<Buffer> {
  const res = await fetch(`${REPLICATE_BASE}/models/${config.image.model}/predictions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.image.apiKey}`,
      "content-type": "application/json",
      prefer: "wait",
    },
    body: JSON.stringify({
      input: { prompt, aspect_ratio: "16:9", output_format: "png", num_outputs: 1 },
    }),
  });
  if (!res.ok) throw new Error(`Replicate HTTP ${res.status}: ${await res.text()}`);

  let prediction = (await res.json()) as ReplicatePrediction;
  prediction = await waitForOutput(prediction);
  const url = firstOutputUrl(prediction.output);
  if (!url) throw new Error(`no image URL in Replicate output (status ${prediction.status})`);

  const img = await fetch(url);
  if (!img.ok) throw new Error(`image download HTTP ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}

interface ReplicatePrediction {
  status: string;
  output: unknown;
  urls?: { get?: string };
  error?: string;
}

async function waitForOutput(p: ReplicatePrediction): Promise<ReplicatePrediction> {
  let current = p;
  for (let i = 0; i < 60 && !isTerminal(current.status); i++) {
    await sleep(1000);
    const getUrl = current.urls?.get;
    if (!getUrl) break;
    const r = await fetch(getUrl, { headers: { authorization: `Bearer ${config.image.apiKey}` } });
    current = (await r.json()) as ReplicatePrediction;
  }
  if (current.status === "failed" || current.error) {
    throw new Error(`Replicate prediction failed: ${current.error ?? "unknown"}`);
  }
  return current;
}

function isTerminal(status: string): boolean {
  return status === "succeeded" || status === "failed" || status === "canceled";
}

function firstOutputUrl(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && typeof output[0] === "string") return output[0];
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
