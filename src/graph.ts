// The LangGraph pipeline: ideate → narrate → visualize → assemble → publish.
// Linear today; the graph makes it trivial to add branches later (e.g. a human
// review node between ideate and narrate, or ret/regenerate loops).
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
