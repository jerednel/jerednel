// LangGraph pipelines. Three flavors so the product can run the cheap step
// (script) separately from the expensive step (render), with a human review in
// between — you approve the script before spending money on voice + images.
//
//   full        ideate → narrate → visualize → assemble → publish
//   script      ideate                                            (fast, cheap)
//   production           narrate → visualize → assemble → publish (from a brief)
import { StateGraph, START, END } from "@langchain/langgraph";
import { PipelineState } from "./state.js";
import { ideate } from "./nodes/ideate.js";
import { narrate } from "./nodes/narrate.js";
import { visualize } from "./nodes/visualize.js";
import { assemble } from "./nodes/assemble.js";
import { publish } from "./nodes/publish.js";

export function buildGraph() {
  return new StateGraph(PipelineState)
    .addNode("ideate", ideate)
    .addNode("narrate", narrate)
    .addNode("visualize", visualize)
    .addNode("assemble", assemble)
    .addNode("publish_video", publish)
    .addEdge(START, "ideate")
    .addEdge("ideate", "narrate")
    .addEdge("narrate", "visualize")
    .addEdge("visualize", "assemble")
    .addEdge("assemble", "publish_video")
    .addEdge("publish_video", END)
    .compile();
}

/** Just the script step — the workflow's cheap "propose" phase. */
export function buildScriptGraph() {
  return new StateGraph(PipelineState)
    .addNode("ideate", ideate)
    .addEdge(START, "ideate")
    .addEdge("ideate", END)
    .compile();
}

/** Voice + images + render + publish, seeded with an approved brief. */
export function buildProductionGraph() {
  return new StateGraph(PipelineState)
    .addNode("narrate", narrate)
    .addNode("visualize", visualize)
    .addNode("assemble", assemble)
    .addNode("publish_video", publish)
    .addEdge(START, "narrate")
    .addEdge("narrate", "visualize")
    .addEdge("visualize", "assemble")
    .addEdge("assemble", "publish_video")
    .addEdge("publish_video", END)
    .compile();
}
