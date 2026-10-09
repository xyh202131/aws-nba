import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { AgentError } from "./errors.ts";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export type Config = ReturnType<typeof loadConfig>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const provider = env.AGENT_PROVIDER ?? "fixture";
  if (provider !== "fixture" && provider !== "bedrock")
    throw new AgentError("CONFIG", "不支持的模型适配器。");
  const region = env.AWS_REGION ?? "us-east-2";
  const profile = env.AWS_PROFILE ?? "aws-personal";
  if (region !== "us-east-2" || profile !== "aws-personal") {
    throw new AgentError(
      "PROJECT_BOUNDARY",
      "当前骨架仅允许 aws-personal / us-east-2；赛事环境须单独核验后适配。",
    );
  }
  const port = Number(env.AGENT_PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new AgentError("CONFIG", "无效端口。");
  const modelId = env.BEDROCK_MODEL_ID ?? "";
  const paidCallsEnabled = env.ALLOW_PAID_MODEL_CALLS === "true";
  if (provider === "bedrock") {
    if (!paidCallsEnabled)
      throw new AgentError(
        "PAID_CALLS_DISABLED",
        "付费模型调用尚未启用。",
        403,
      );
    // Only direct foundation-model IDs are accepted. Inference profiles/ARNs may route across Regions.
    if (
      !/^(qwen|amazon|anthropic|meta|mistral|google|openai|deepseek|nvidia|cohere)\.[a-z0-9][a-z0-9.:-]+$/.test(
        modelId,
      )
    ) {
      throw new AgentError(
        "MODEL_NOT_CONFIGURED",
        "需配置已核验、区域内可调用的直接模型 ID，禁止跨区域 inference profile。",
      );
    }
  }
  const host = env.AGENT_HOST ?? "127.0.0.1";
  if (!["127.0.0.1", "0.0.0.0"].includes(host))
    throw new AgentError("CONFIG", "无效监听地址。");
  if (host !== "127.0.0.1" && env.AGENT_RUNTIME_CONTAINER !== "true")
    throw new AgentError("CONFIG", "本地服务只监听回环地址。");
  return {
    provider: provider as "fixture" | "bedrock",
    region,
    profile,
    port,
    host,
    modelId,
    paidCallsEnabled,
    dataDir: resolve(ROOT, env.AGENT_DATA_DIR ?? ".local/agent"),
    ffmpegPath: env.FFMPEG_PATH || undefined,
  };
}
