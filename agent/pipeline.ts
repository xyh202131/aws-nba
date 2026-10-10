import type {
  AgentRequest,
  AgentResult,
  ModelInvocation,
  StageId,
} from "../shared/agent.ts";
import type { Config } from "./config.ts";
import { loadMaterial } from "./catalog.ts";
import { extractFrames } from "./frames.ts";
import { analyze } from "./providers.ts";
import { validateObservation } from "./contracts.ts";
import { loadUploadedMaterial, probeMedia } from "./media.ts";
import { analyzeStory, planFrames } from "./story.ts";
import { renderFilm } from "./render.ts";
import type { MatchData } from "../shared/agent.ts";

export async function runPipeline(
  request: AgentRequest,
  jobId: string,
  config: Config,
  stage: (id: StageId) => Promise<void>,
  recordInvocation: (value: ModelInvocation) => Promise<void> = async () => {},
): Promise<AgentResult> {
  if (request.outputMode === "film")
    return runFilmPipeline(request, jobId, config, stage, recordInvocation);
  await stage("material");
  const { clip, videoPath, previewSha256 } = await loadMaterial(request.clipId);
  await stage("frames");
  const frames = await extractFrames(clip, videoPath, jobId, config);
  await stage("analysis");
  const output = await analyze(clip, frames, jobId, config, recordInvocation);
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

async function runFilmPipeline(
  request: AgentRequest,
  jobId: string,
  config: Config,
  stage: (id: StageId) => Promise<void>,
  recordInvocation: (v: ModelInvocation) => Promise<void>,
): Promise<AgentResult> {
  await stage("material");
  let videoPath: string,
    title: string,
    originalSha256: string,
    previewSha256: string;
  let data: MatchData;
  let analyzedAsset: "preview" | "upload";
  let official: AgentResult["official"] = null;
  if (request.clipId.startsWith("train_")) {
    const material = await loadMaterial(request.clipId);
    const { clip } = material;
    videoPath = material.videoPath;
    previewSha256 = material.previewSha256;
    originalSha256 = clip.sourceSha256;
    analyzedAsset = "preview";
    title = `${clip.player} · ${clip.title}`;
    official = {
      recordId: clip.recordId,
      xfgPercent: clip.xfg,
      sourceUrl: clip.sourceUrl,
      origin: "existing_catalog",
    };
    data = {
      schemaVersion: "courtside.match-data.v1",
      source: "existing_catalog",
      warnings: [],
      events: [
        {
          id: clip.recordId,
          recordId: clip.recordId,
          videoTimeSeconds: clip.release,
          playerName: clip.player,
          description: clip.shotDescription,
          xfgPercent: clip.xfg,
          sourceUrl: clip.sourceUrl,
        },
      ],
    };
  } else {
    const material = await loadUploadedMaterial(request.clipId, config);
    videoPath = material.videoPath;
    title = material.material.title;
    data = material.material.data;
    originalSha256 = previewSha256 = material.material.upload.sha256;
    analyzedAsset = "upload";
  }
  const info = await probeMedia(videoPath, config);
  const planning = planFrames(info.duration, data);
  await stage("frames");
  const frames = await extractFrames(
    { id: request.clipId, moments: planning.moments },
    videoPath,
    jobId,
    config,
  );
  await stage("analysis");
  const output = await analyzeStory(
    frames,
    data,
    info.duration,
    jobId,
    config,
    recordInvocation,
  );
  await stage("validation");
  const observation = {
    text: output.cues[0]!.text,
    time: output.cues[0]!.time,
    evidenceIds: output.cues[0]!.evidenceIds,
  };
  await stage("render");
  const film = await renderFilm(
    title,
    videoPath,
    info,
    output.cues,
    data,
    jobId,
    config,
  );
  await stage("package");
  return {
    schemaVersion: "courtside.agent.result.v1",
    clipId: request.clipId,
    provider: config.provider,
    modelId: output.modelId,
    reviewStatus:
      config.provider === "fixture" ? "fixture_replay" : "needs_review",
    observation,
    interpretation: null,
    official,
    media: { originalSha256, previewSha256, analyzedAsset },
    frames,
    usage: output.usage,
    film,
    boundaries: [
      config.provider === "fixture"
        ? "离线工程演示文案，未分析比赛内容，未调用模型。"
        : "AI 解说已生成，语义仍待人工复核；证据帧为稀疏采样。",
      "数据图形数值直接来自输入记录，模型不生成命中率；时间关系不等于因果关系。",
      ...data.warnings,
      "成片包含本机中文语音、烧录字幕和事件数据图形；没有球员追踪或场地坐标标注。",
      "本地 Web 已提供播放和下载，尚未部署公网；当前内部协议不是官方赛事提交包。",
    ],
  };
}
