import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { AgentError } from "./errors.ts";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const MODELS = {
  "global.anthropic.claude-sonnet-4-6": {
    name: "Claude Sonnet 4.6",
    structuredOutput: true,
    inputPerMillion: 3,
    outputPerMillion: 15,
  },
  "qwen.qwen3-vl-235b-a22b": {
    name: "Qwen3-VL 235B",
    structuredOutput: false,
    inputPerMillion: 0.53,
    outputPerMillion: 2.66,
  },
} as const;
export type ModelId = keyof typeof MODELS;
export type Config = ReturnType<typeof loadConfig>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const provider = env.AGENT_PROVIDER ?? "fixture";
  if (provider !== "fixture" && provider !== "bedrock")
    throw new AgentError("CONFIG", "不支持的模型适配器。");
  const region = env.AWS_REGION ?? "us-east-1";
  const profile = env.AWS_PROFILE ?? "nba";
  if (region !== "us-east-1" || profile !== "nba") {
    throw new AgentError(
      "PROJECT_BOUNDARY",
      "当前 Agent 仅允许已核验的赛事 nba / us-east-1。",
    );
  }
  const port = Number(env.AGENT_PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new AgentError("CONFIG", "无效端口。");
  const modelId = env.BEDROCK_MODEL_ID ?? "global.anthropic.claude-sonnet-4-6";
  const paidCallsEnabled = env.ALLOW_PAID_MODEL_CALLS === "true";
  if (provider === "bedrock") {
    if (!paidCallsEnabled)
      throw new AgentError(
        "PAID_CALLS_DISABLED",
        "付费模型调用尚未启用。",
        403,
      );
    // Only the two models verified in the contest project are accepted.
    if (!Object.hasOwn(MODELS, modelId)) {
      throw new AgentError(
        "MODEL_NOT_CONFIGURED",
        "仅支持已核验的 Qwen3-VL 235B 或 Global Sonnet 4.6，禁止任意模型/路由回退。",
      );
    }
  }
  const host = env.AGENT_HOST ?? "127.0.0.1";
  if (!["127.0.0.1", "0.0.0.0"].includes(host))
    throw new AgentError("CONFIG", "无效监听地址。");
  if (host !== "127.0.0.1" && env.AGENT_RUNTIME_CONTAINER !== "true")
    throw new AgentError("CONFIG", "本地服务只监听回环地址。");
  const filmResolution = env.FILM_RESOLUTION ?? "720p";
  if (filmResolution !== "720p" && filmResolution !== "source")
    throw new AgentError("CONFIG", "不支持的成片分辨率策略。");
  return {
    provider: provider as "fixture" | "bedrock",
    region,
    profile,
    port,
    host,
    modelId: modelId as ModelId,
    paidCallsEnabled,
    filmResolution: filmResolution as "720p" | "source",
    dataDir: resolve(ROOT, env.AGENT_DATA_DIR ?? ".local/agent"),
    ffmpegPath: env.FFMPEG_PATH || undefined,
    visionPython: resolve(
      ROOT,
      env.VISION_PYTHON ||
        (process.platform === "win32"
          ? ".local/vision-venv/Scripts/python.exe"
          : ".local/vision-venv/bin/python"),
    ),
    visionWeightsDir: resolve(ROOT, ".local/vision-models"),
  };
}
