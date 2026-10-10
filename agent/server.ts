import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentHealth } from "../shared/agent.ts";
import { loadConfig, type Config } from "./config.ts";
import { AgentError, publicError } from "./errors.ts";
import { parseRequest } from "./contracts.ts";
import { JobManager } from "./jobs.ts";
import { adaptOfficialRequest } from "./official-adapter.ts";
import { receiveVideo, registerMaterial } from "./media.ts";
import { DATA_TEMPLATE, normalizeMatchData } from "./match-data.ts";
import { checkContestConnection } from "./credentials.ts";

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
async function body(req: IncomingMessage, limit = 16_384): Promise<unknown> {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json")
    throw new AgentError("CONTENT_TYPE", "仅接受 application/json。", 415);
  let length = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > limit)
      throw new AgentError(
        "BODY_TOO_LARGE",
        "JSON 请求超过接口大小限制。",
        413,
      );
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
      if (req.method === "GET" && path === "/api/connection") {
        if (config.provider !== "bedrock")
          throw new AgentError(
            "OFFLINE_MODE",
            "离线模式不检查 AWS 凭据。",
            409,
          );
        json(res, 200, await checkContestConnection());
        return;
      }
      if (req.method === "GET" && path === "/api/data/template") {
        json(res, 200, DATA_TEMPLATE);
        return;
      }
      if (req.method === "POST" && path === "/api/data/preview") {
        json(res, 200, normalizeMatchData(await body(req, 2_000_000)));
        return;
      }
      if (req.method === "POST" && path === "/api/media") {
        json(res, 201, await receiveVideo(req, config));
        return;
      }
      if (req.method === "POST" && path === "/api/materials") {
        json(
          res,
          201,
          await registerMaterial(await body(req, 2_000_000), config),
        );
        return;
      }
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
          modelId: config.provider === "bedrock" ? config.modelId : null,
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
        const request = parseRequest(await body(req));
        if ((request.executionMode ?? "fixture") !== config.provider) {
          throw new AgentError(
            "EXECUTION_MODE_MISMATCH",
            "页面运行模式与 Agent 配置不同，请刷新连接后再创建任务。",
            403,
          );
        }
        if (config.provider === "bedrock" && !config.paidCallsEnabled)
          throw new AgentError(
            "PAID_CALLS_DISABLED",
            "付费模型调用未启用。",
            403,
          );
        if (
          !request.clipId.startsWith("train_") &&
          request.outputMode !== "film"
        )
          throw new AgentError(
            "OUTPUT_MODE_REQUIRED",
            "上传素材使用 film 输出模式。",
          );
        const job = await manager.create(request);
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
      const artifactMatch = path.match(
        /^\/api\/jobs\/([a-f0-9-]{36})\/artifacts\/(film\.mp4|captions\.vtt|timeline\.json|tracks\.jsonl|detections\.jsonl|track-index\.json|excluded-detections\.jsonl|floor-regions\.jsonl|tracking-manifest\.json|identity-links\.json|event-track-links\.json|overlay-timeline\.json)$/,
      );
      if (req.method === "GET" && artifactMatch) {
        const job = manager.get(artifactMatch[1]!);
        if (job.status !== "completed" || !job.result?.film)
          throw new AgentError("RESULT_NOT_READY", "作品尚未完成。", 409);
        const filename = artifactMatch[2]!;
        if (
          (filename === "track-index.json" &&
            !job.result.tracking?.trackIndex) ||
          (filename === "detections.jsonl" && !job.result.tracking?.detections)
        )
          throw new AgentError("NOT_FOUND", "该旧作品没有此追踪文件。", 404);
        if (
          !["film.mp4", "captions.vtt", "timeline.json"].includes(filename) &&
          !job.result.tracking
        )
          throw new AgentError("NOT_FOUND", "该作品未执行追踪。", 404);
        const file = resolve(config.dataDir, "artifacts", job.id, filename);
        const size = (await stat(file)).size;
        const range = req.headers.range;
        let start = 0,
          end = size - 1;
        if (range) {
          const m = range.match(/^bytes=(\d*)-(\d*)$/);
          if (!m || (!m[1] && !m[2])) {
            res.writeHead(416, { "Content-Range": `bytes */${size}` });
            res.end();
            return;
          }
          start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
          end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
          if (
            !Number.isSafeInteger(start) ||
            !Number.isSafeInteger(end) ||
            start > end ||
            start >= size
          ) {
            res.writeHead(416, { "Content-Range": `bytes */${size}` });
            res.end();
            return;
          }
        }
        res.writeHead(range ? 206 : 200, {
          "Content-Type": filename.endsWith("mp4")
            ? "video/mp4"
            : filename.endsWith("vtt")
              ? "text/vtt; charset=utf-8"
              : filename.endsWith("jsonl")
                ? "application/x-ndjson; charset=utf-8"
                : "application/json; charset=utf-8",
          "Accept-Ranges": "bytes",
          "Content-Length": end - start + 1,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          ...(range
            ? { "Content-Range": `bytes ${start}-${end}/${size}` }
            : {}),
        });
        const stream = createReadStream(file, { start, end });
        stream.on("error", () => res.destroy());
        res.on("close", () => stream.destroy());
        stream.pipe(res);
        return;
      }
      const match = path.match(
        /^\/api\/jobs\/([a-f0-9-]{36})(?:\/(result|frames\/(\d{1,2})\.jpg))?$/,
      );
      if (req.method === "GET" && match) {
        const job = manager.get(match[1]!);
        if (match[3] !== undefined) {
          if (Number(match[3]) >= (job.result?.frames.length ?? 0))
            throw new AgentError("NOT_FOUND", "证据帧不存在。", 404);
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
  server.requestTimeout = 300_000;
  server.headersTimeout = 10_000;
  server.setTimeout(210_000, (socket) => socket.destroy());
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
