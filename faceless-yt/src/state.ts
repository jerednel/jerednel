import { Annotation } from "@langchain/langgraph";
import type { Brief } from "./schemas.js";

export interface NarrationAsset {
  sceneIndex: number;
  audioPath: string | null; // null in mock mode
  durationSec: number;
  source: string; // "elevenlabs" | "mock"
}

export interface VisualAsset {
  sceneIndex: number;
  prompt: string;
  imagePath: string | null; // null in mock mode
  source: string; // "flux" | "mock"
}

export interface RenderPlan {
  outputPath: string;
  ffmpegScriptPath: string;
  ffmpegAvailable: boolean;
}

export interface PublishResult {
  status: string; // "uploaded" | "planned"
  videoId: string | null;
  url: string | null;
  source: string; // "youtube" | "mock"
}

// The shared graph state. Each node reads what it needs and writes its slice.
export const PipelineState = Annotation.Root({
  topic: Annotation<string>(),
  slug: Annotation<string>(),
  projectDir: Annotation<string>(),
  brief: Annotation<Brief | null>({ reducer: (_, b) => b, default: () => null }),
  narration: Annotation<NarrationAsset[]>({ reducer: (_, v) => v, default: () => [] }),
  visuals: Annotation<VisualAsset[]>({ reducer: (_, v) => v, default: () => [] }),
  renderPlan: Annotation<RenderPlan | null>({ reducer: (_, v) => v, default: () => null }),
  publish: Annotation<PublishResult | null>({ reducer: (_, v) => v, default: () => null }),
});

export type PipelineStateType = typeof PipelineState.State;
