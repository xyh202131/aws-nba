import type { AgentRequest, AgentResult, StageId } from "../shared/agent.ts";
import type { Config } from "./config.ts";
import { loadMaterial } from "./catalog.ts";
import { extractFrames } from "./frames.ts";
import { analyze } from "./providers.ts";
import { validateObservation } from "./contracts.ts";

export async function runPipeline(
  request: AgentRequest,
  jobId: string,
  config: Config,
  stage: (id: StageId) => Promise<void>,
): Promise<AgentResult> {
  await stage("material");
  const { clip, videoPath, previewSha256 } = await loadMaterial(request.clipId);
  await stage("frames");
  const frames = await extractFrames(clip, videoPath, jobId, config);
  await stage("analysis");
  const output = await analyze(clip, frames, jobId, config);
  await stage("validation");
  const observation = validateObservation(
    output.observation,
    clip.duration,
    frames,
  );
  await stage("package");
  return {
    schemaVersion: "courtside.agent.result.v1",
    clipId: clip.id,
    provider: config.provider,
    modelId: output.modelId,
    reviewStatus:
      config.provider === "fixture" ? "fixture_replay" : "needs_review",
    observation,
    interpretation: null,
    official: {
      recordId: clip.recordId,
      xfgPercent: clip.xfg,
      sourceUrl: clip.sourceUrl,
      origin: "existing_catalog",
    },
    media: {
      originalSha256: clip.sourceSha256,
      previewSha256,
      analyzedAsset: "preview",
    },
    frames,
    usage: output.usage,
    boundaries: [
      config.provider === "fixture"
        ? "离线回放已有 AI 观察，本次未调用模型。"
        : "模型观察待复核；结构校验不证明语义正确。",
      "本次从预览副本重新抽帧，不能视为原视频逐帧精度。",
      "官方指标来自既有目录，未由模型预测。",
      "未做独立人工审计、球员追踪、因果分析、语音或带标注成片渲染。",
      "当前结果是内部协议，不是赛事提交包。",
    ],
  };
}
