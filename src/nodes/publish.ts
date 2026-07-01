// ⑤ PUBLISH — upload the assembled video to YouTube as a draft/scheduled item.
// Real upload via the YouTube Data API is stubbed behind credentials; mock mode
// records a "planned" result so the pipeline completes end to end.
import { existsSync } from "node:fs";
import { config } from "../config.js";
import type { PublishResult, PipelineStateType } from "../state.js";

export async function publish(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  const { renderPlan, brief } = state;

  const haveCreds =
    !!config.youtube.clientId && !!config.youtube.clientSecret && !!config.youtube.refreshToken;
  const useReal =
    (config.youtube.provider === "youtube" || config.youtube.provider === "auto") && haveCreds;

  const videoExists = !!renderPlan && existsSync(renderPlan.outputPath);

  if (useReal && videoExists) {
    // TODO: exchange refresh token → access token, then resumable upload to
    //   https://www.googleapis.com/upload/youtube/v3/videos with snippet from
    //   `brief` (title/description/tags) and status=private/scheduled.
    console.log("  ⑤ publish → YouTube upload stub (wire Data API here)");
    const result: PublishResult = {
      status: "planned",
      videoId: null,
      url: null,
      source: "youtube",
    };
    return { publish: result };
  }

  const reason = !haveCreds ? "no YouTube creds" : "video.mp4 not rendered yet";
  console.log(`  ⑤ publish → planned only (${reason})`);
  const result: PublishResult = {
    status: "planned",
    videoId: null,
    url: null,
    source: "mock",
  };
  return { publish: result };
}
