import { fromIni, fromEnv, fromHttp } from "@aws-sdk/credential-providers";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { AgentError } from "./errors.ts";

type Identity = Awaited<ReturnType<ReturnType<typeof fromIni>>>;
/** Keep temporary credentials only in memory; refresh the same profile, never fall back. */
export function createContestCredentials(
  resolve: () => Promise<Identity>,
  now: () => number = Date.now,
) {
  let cached: Identity | null = null;
  let pending: Promise<Identity> | null = null;
  return async (): Promise<Identity> => {
    if (cached?.expiration && cached.expiration.getTime() - now() > 300_000)
      return cached;
    if (!pending) {
      pending = (async () => {
        const value = await resolve();
        if (value.accountId !== "414702114718")
          throw new AgentError(
            "PROJECT_BOUNDARY",
            "SDK 凭据没有确认指向赛事项目，已停止调用。",
            403,
          );
        cached = value;
        return value;
      })().finally(() => {
        pending = null;
      });
    }
    return pending;
  };
}

// Do not set clientConfig.region: SSO uses us-west-2, the nba role uses us-east-1.
const hosted = process.env.AGENT_RUNTIME_CONTAINER === "true" && process.env.AWS_AUTH_MODE === "execution_role";
// AgentCore uses the container HTTP provider, including authorization-token files.
// The legacy ECS metadata provider does not support every runtime endpoint/token source.
const runtimeSource = process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI || process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI
  ? fromHttp({ timeout: 5000, maxRetries: 0 }) : fromEnv();
export const contestCredentials = createContestCredentials(hosted ? async () => {
  const credentials = await runtimeSource();
  const client = new STSClient({ region: "us-east-1", credentials, maxAttempts: 1 });
  try {
    const identity = await client.send(new GetCallerIdentityCommand({}), { abortSignal: AbortSignal.timeout(15_000) });
    if (identity.Account !== "414702114718" || !identity.Arn?.startsWith("arn:aws:sts::414702114718:assumed-role/NBAHackathonWorkloadRole/"))
      throw new AgentError("PROJECT_BOUNDARY", "云端执行身份不属于授权的赛事工作角色。", 403);
    return { ...credentials, accountId: identity.Account };
  } finally { client.destroy(); }
} : fromIni({ profile: "nba", clientConfig: { maxAttempts: 1 } }));

export async function checkContestConnection() {
  try {
    const value = await contestCredentials();
    return {
      profile: "nba",
      region: "us-east-1",
      accountId: value.accountId,
      expiresAt: value.expiration?.toISOString() ?? null,
    };
  } catch (error) {
    if (error instanceof AgentError) throw error;
    throw new AgentError(
      "CREDENTIALS_UNAVAILABLE",
      "赛事 SDK 凭据暂未获取成功。没有启动模型，请重试检查连接；CLI 可用不代表 SDK 已连接。",
      503,
    );
  }
}
