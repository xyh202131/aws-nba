import { fromIni } from "@aws-sdk/credential-providers";
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
export const contestCredentials = createContestCredentials(
  fromIni({ profile: "nba", clientConfig: { maxAttempts: 1 } }),
);

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
