import {
  REQUEST_SCHEMA,
  REQUEST_SCHEMA_V2,
  type AgentRequest,
  type AgentFrame,
  type AgentObservation,
} from "../shared/agent.ts";
import { AgentError } from "./errors.ts";

export function parseRequest(value: unknown): AgentRequest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AgentError("INVALID_REQUEST", "请求必须为 JSON 对象。");
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).some(
      (key) =>
        ![
          "schemaVersion",
          "clipId",
          "executionMode",
          "outputMode",
          ...(data.schemaVersion === REQUEST_SCHEMA_V2
            ? ["trackingMode", "reuseNarrationJobId"]
            : []),
        ].includes(key),
    )
  )
    throw new AgentError("INVALID_REQUEST", "请求含有不支持的字段。");
  if (
    data.schemaVersion !== REQUEST_SCHEMA &&
    data.schemaVersion !== REQUEST_SCHEMA_V2
  )
    throw new AgentError(
      "UNSUPPORTED_PROTOCOL",
      "当前只支持内部 v1/v2 协议；官方赛事协议尚未接入。",
    );
  if (
    typeof data.clipId !== "string" ||
    !/^(?:train_\d{3}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(
      data.clipId,
    )
  )
    throw new AgentError(
      "UNKNOWN_CLIP",
      "需要已注册素材 ID，不接受路径或远程 URL。",
    );
  if (
    data.executionMode !== undefined &&
    !["fixture", "bedrock"].includes(data.executionMode as string)
  )
    throw new AgentError("INVALID_REQUEST", "无效运行模式。");
  if (
    data.outputMode !== undefined &&
    !["analysis", "film"].includes(data.outputMode as string)
  )
    throw new AgentError("INVALID_REQUEST", "无效输出模式。");
  if (
    data.trackingMode !== undefined &&
    !["none", "required"].includes(data.trackingMode as string)
  )
    throw new AgentError("INVALID_REQUEST", "无效追踪模式。");
  if (data.trackingMode === "required" && data.outputMode !== "film")
    throw new AgentError("INVALID_REQUEST", "人物追踪仅支持 film 输出。");
  if (
    data.reuseNarrationJobId !== undefined &&
    (typeof data.reuseNarrationJobId !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
        data.reuseNarrationJobId,
      ) ||
      data.trackingMode !== "required" ||
      data.outputMode !== "film")
  )
    throw new AgentError(
      "INVALID_REQUEST",
      "复用解说需要有效来源任务和追踪成片模式。",
    );
  return {
    schemaVersion: data.schemaVersion,
    clipId: data.clipId,
    ...(data.executionMode === undefined
      ? {}
      : { executionMode: data.executionMode as "fixture" | "bedrock" }),
    ...(data.outputMode === undefined
      ? {}
      : { outputMode: data.outputMode as "analysis" | "film" }),
    ...(data.trackingMode === undefined
      ? {}
      : { trackingMode: data.trackingMode as "none" | "required" }),
    ...(data.reuseNarrationJobId === undefined
      ? {}
      : { reuseNarrationJobId: data.reuseNarrationJobId as string }),
  };
}

export function validateObservation(
  value: unknown,
  duration: number,
  frames: AgentFrame[],
): AgentObservation {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AgentError("INVALID_MODEL_OUTPUT", "分析结果必须为结构化观察。");
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).sort().join() !== ["evidenceIds", "text", "time"].join()
  )
    throw new AgentError(
      "INVALID_MODEL_OUTPUT",
      "分析结果含有缺失或未授权字段。",
    );
  if (
    typeof data.text !== "string" ||
    !data.text.trim() ||
    data.text.length > 600
  )
    throw new AgentError("INVALID_MODEL_OUTPUT", "观察文本不符合长度要求。");
  if (
    typeof data.time !== "number" ||
    !Number.isFinite(data.time) ||
    data.time < 0 ||
    data.time > duration
  )
    throw new AgentError("INVALID_MODEL_OUTPUT", "观察时间超出素材范围。");
  if (
    !Array.isArray(data.evidenceIds) ||
    !data.evidenceIds.length ||
    data.evidenceIds.length > frames.length ||
    new Set(data.evidenceIds).size !== data.evidenceIds.length ||
    !data.evidenceIds.every(
      (id) => typeof id === "string" && frames.some((f) => f.id === id),
    )
  ) {
    throw new AgentError(
      "INVALID_MODEL_OUTPUT",
      "观察必须引用本次真实证据帧。",
    );
  }
  const evidenceIds = data.evidenceIds as string[];
  if (
    !frames.some(
      (f) =>
        evidenceIds.includes(f.id) &&
        Math.abs(f.time - (data.time as number)) < 1,
    )
  )
    throw new AgentError("INVALID_MODEL_OUTPUT", "观察时间与引用帧不匹配。");
  return {
    text: data.text.trim(),
    time: data.time,
    evidenceIds: data.evidenceIds as string[],
  };
}
