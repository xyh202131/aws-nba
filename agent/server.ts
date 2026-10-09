import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentHealth } from "../shared/agent.ts";
import { loadConfig, type Config } from "./config.ts";
import { AgentError, publicError } from "./errors.ts";
import { parseRequest } from "./contracts.ts";
import { JobManager } from "./jobs.ts";
import { adaptOfficialRequest } from "./official-adapter.ts";

const ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage): Promise<unknown> {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json")
    throw new AgentError("CONTENT_TYPE", "仅接受 application/json。", 415);
  let length = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 16_384)
      throw new AgentError("BODY_TOO_LARGE", "请求超过 16 KB。", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AgentError("INVALID_JSON", "请求不是有效 JSON。");
  }
}
export async function createAgentServer(
  config: Config,
  suppliedManager?: JobManager,
) {
  const manager = suppliedManager ?? new JobManager(config);
  await manager.initialize();
  const server = createServer(async (req, res) => {
    try {
      // Reject rebinding/cross-site access before touching local data or starting jobs.
      const host = req.headers.host?.split(":")[0];
      if (
        config.host === "127.0.0.1" &&
        host !== "127.0.0.1" &&
        host !== "localhost"
      )
        throw new AgentError("HOST_DENIED", "不支持的访问地址。", 403);
      const origin = req.headers.origin;
      if (origin && !ORIGINS.has(origin))
        throw new AgentError("ORIGIN_DENIED", "不支持的访问来源。", 403);
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        });
        res.end();
        return;
      }
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      if (
        req.method === "GET" &&
        (path === "/ping" || path === "/api/health")
      ) {
        const health: AgentHealth = {
          status: manager.busy ? "HealthyBusy" : "Healthy",
          provider: config.provider,
          paidCallsEnabled:
            config.provider === "bedrock" && config.paidCallsEnabled,
          region: config.region,
          officialProtocol: "not_configured",
        };
        json(res, 200, health);
        return;
      }
      if (req.method === "GET" && path === "/api/jobs") {
        json(res, 200, manager.list());
        return;
      }
      if (req.method === "POST" && path === "/official/invocations") {
        adaptOfficialRequest(await body(req));
      }
      if (
        req.method === "POST" &&
        (path === "/api/jobs" || path === "/invocations")
      ) {
        if (path === "/api/jobs" && config.provider !== "fixture") {
          throw new AgentError(
            "INTERACTIVE_PAID_CALLS_DISABLED",
            "网页任务入口只允许运行离线流程。",
            403,
          );
        }
        const job = await manager.create(parseRequest(await body(req)));
        if (path === "/api/jobs") {
          json(res, 202, job);
          return;
        }
        await manager.settled();
        json(
          res,
          job.status === "completed" ? 200 : 500,
          job.status === "completed" ? job.result : { error: job.error },
        );
        return;
      }
      const match = path.match(
        /^\/api\/jobs\/([a-f0-9-]{36})(?:\/(result|frames\/([012])\.jpg))?$/,
      );
      if (req.method === "GET" && match) {
        const job = manager.get(match[1]!);
        if (match[3] !== undefined) {
          if (job.status !== "completed")
            throw new AgentError(
              "RESULT_NOT_READY",
              "任务尚未生成可用结果。",
              409,
            );
          const bytes = await readFile(
            resolve(config.dataDir, "frames", job.id, `${match[3]}.jpg`),
          );
          res.writeHead(200, {
            "Content-Type": "image/jpeg",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          });
          res.end(bytes);
          return;
        }
        if (match[2] === "result") {
          if (!job.result)
            throw new AgentError("RESULT_NOT_READY", "任务没有可用结果。", 409);
          json(res, 200, job.result);
          return;
        }
        json(res, 200, job);
        return;
      }
      throw new AgentError("NOT_FOUND", "接口不存在。", 404);
    } catch (error) {
      if (!res.headersSent && !res.destroyed)
        json(res, error instanceof AgentError ? error.status : 500, {
          error: publicError(error),
        });
    }
  });
  server.requestTimeout = 90_000;
  server.headersTimeout = 10_000;
  server.setTimeout(90_000, (socket) => socket.destroy());
  return { server, manager };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const config = loadConfig();
  const { server } = await createAgentServer(config);
  server.listen(config.port, config.host, () =>
    console.log(
      `COURTSIDE Agent http://${config.host}:${config.port} | ${config.provider} | paid calls ${config.provider === "bedrock" && config.paidCallsEnabled ? "enabled" : "disabled"}`,
    ),
  );
}
