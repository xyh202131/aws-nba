import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, writeFile, stat, readdir } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { resolve } from "node:path";
import { contestCredentials } from "./credentials.ts";
import { UUID, fileHash, type Material } from "./media.ts";
import type { Config } from "./config.ts";
import type { Job } from "../shared/agent.ts";
import { AgentError } from "./errors.ts";

export function cloudEnabled() { return process.env.AWS_AUTH_MODE === "execution_role" && process.env.AGENT_RUNTIME_CONTAINER === "true"; }
function client() { return new S3Client({ region: "us-east-1", credentials: contestCredentials, maxAttempts: 1 }); }
function buckets() {
  if (!cloudEnabled() || process.env.CLOUD_INPUT_BUCKET !== "nba-hackathon-414702114718-team11" ||
      !/^courtside-web-414702114718-[a-z0-9-]+$/.test(process.env.CLOUD_SITE_BUCKET ?? ""))
    throw new AgentError("PROJECT_BOUNDARY", "云端存储配置不属于赛事部署。", 403);
  return { input: process.env.CLOUD_INPUT_BUCKET, site: process.env.CLOUD_SITE_BUCKET! };
}
export async function stageCloudMaterial(id: string, config: Config) {
  if (id.startsWith("train_")) return;
  if (!UUID.test(id)) throw new AgentError("UNKNOWN_MATERIAL", "云端素材 ID 无效。", 400);
  const s3 = client(), { input } = buckets();
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: input, Key: `courtside/input/materials/${id}.json` }), { abortSignal: AbortSignal.timeout(60_000) });
    if (!response.Body || !response.ContentLength || response.ContentLength > 2_000_000) { (response.Body as Readable | undefined)?.destroy(); throw new AgentError("MATERIAL_LIMIT", "云端素材清单大小无效。", 422); }
    const text = await response.Body.transformToString();
    const material = JSON.parse(text) as Material;
    if (material.id !== id || !material.upload || !UUID.test(material.upload.id) ||
        !/^[a-f0-9]{64}$/.test(material.upload.sha256) || !Number.isSafeInteger(material.upload.bytes) ||
        material.upload.bytes < 1 || material.upload.bytes > 100_000_000 ||
        !material.data || material.data.schemaVersion !== "courtside.match-data.v1" ||
        !Array.isArray(material.data.events) || material.data.events.length > 1000 ||
        !Number.isFinite(material.upload.duration) || material.upload.duration < 5 || material.upload.duration > 60)
      throw new AgentError("MATERIAL_LIMIT", "云端首版接受 5–60 秒、100 MB 内的已登记素材。", 422);
    await mkdir(resolve(config.dataDir, "uploads"), { recursive: true });
    await mkdir(resolve(config.dataDir, "materials"), { recursive: true });
    const path = resolve(config.dataDir, "uploads", `${material.upload.id}.video`);
    const video = await s3.send(new GetObjectCommand({ Bucket: input, Key: `courtside/input/uploads/${material.upload.id}.video` }), { abortSignal: AbortSignal.timeout(120_000) });
    if (!video.Body || video.ContentLength !== material.upload.bytes) { (video.Body as Readable | undefined)?.destroy(); throw new AgentError("MEDIA_HASH_MISMATCH", "云端视频大小与清单不符。", 422); }
    await pipeline(video.Body as Readable, createWriteStream(path), { signal: AbortSignal.timeout(120_000) });
    if (await fileHash(path) !== material.upload.sha256) throw new AgentError("MEDIA_HASH_MISMATCH", "云端视频哈希与清单不符。", 422);
    await writeFile(resolve(config.dataDir, "materials", `${id}.json`), text);
  } finally { s3.destroy(); }
}

const publicArtifacts = /^(film\.mp4|captions\.vtt|timeline\.json|tracks\.jsonl|detections\.jsonl|track-index\.json|excluded-detections\.jsonl|floor-regions\.jsonl|person-role-evidence\.jsonl|tracking-manifest\.json|identity-links\.json|event-track-links\.json|overlay-timeline\.json)$/;
const mime = (name: string) => name.endsWith(".mp4") ? "video/mp4" : name.endsWith(".vtt") ? "text/vtt; charset=utf-8" : name.endsWith(".jpg") ? "image/jpeg" : name.endsWith(".jsonl") ? "application/x-ndjson; charset=utf-8" : "application/json; charset=utf-8";
export async function publishCloudJob(job: Job, config: Config) {
  const s3 = client(), { input, site } = buckets();
  const put = async (Bucket: string, Key: string, path: string) => {
    const size = (await stat(path)).size;
    await s3.send(new PutObjectCommand({ Bucket, Key, Body: createReadStream(path), ContentLength: size,
      ContentType: mime(path), CacheControl: "no-store", ServerSideEncryption: "AES256" }), { abortSignal: AbortSignal.timeout(120_000) });
  };
  try {
    await put(input, `courtside/jobs/${job.id}.json`, resolve(config.dataDir, "jobs", `${job.id}.json`));
    const folder = resolve(config.dataDir, "artifacts", job.id);
    let files: string[] = [];
    try { files = await readdir(folder); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    for (const name of files) {
      const path = resolve(folder, name);
      if (!(await stat(path)).isFile()) continue;
      await put(input, `courtside/artifacts/${job.id}/${name}`, path);
      if (job.status === "completed" && publicArtifacts.test(name)) await put(site, `api/jobs/${job.id}/artifacts/${name}`, path);
    }
    if (job.status === "completed" && job.result) {
      for (const [i] of job.result.frames.entries()) await put(site, `api/jobs/${job.id}/frames/${i}.jpg`, resolve(config.dataDir, "frames", job.id, `${i}.jpg`));
    }
    const published = { ...job, ...(job.invocation ? { invocation: { ...job.invocation, rawText: null, rawTextTruncated: true } } : {}) };
    const Body = JSON.stringify(published);
    await s3.send(new PutObjectCommand({ Bucket: site, Key: `api/jobs/${job.id}`, Body, ContentType: mime("job.json"), CacheControl: "no-store", ServerSideEncryption: "AES256" }));
    // Conditional writes protect results across independent runtime sessions. Only storage conflicts retry.
    for (let attempt = 0; ; attempt++) {
      let previous: Job[] = [], etag: string | undefined;
      try {
        const index = await s3.send(new GetObjectCommand({ Bucket: site, Key: "api/jobs" }), { abortSignal: AbortSignal.timeout(60_000) });
        etag = index.ETag;
        if (index.Body) previous = JSON.parse(await index.Body.transformToString());
        if (!Array.isArray(previous)) throw new AgentError("STORE_CORRUPT", "云端作品索引无效。", 500);
      } catch (error) { if (!["NoSuchKey", "NotFound"].includes((error as Error).name)) throw error; }
      try {
        await s3.send(new PutObjectCommand({ Bucket: site, Key: "api/jobs", Body: JSON.stringify([published, ...previous.filter(j => j.id !== job.id)].slice(0, 30)),
          ...(etag ? { IfMatch: etag } : { IfNoneMatch: "*" }), ContentType: mime("jobs.json"), CacheControl: "no-store", ServerSideEncryption: "AES256" }), { abortSignal: AbortSignal.timeout(60_000) });
        break;
      } catch (error) {
        if (attempt >= 2 || !["PreconditionFailed", "ConditionalRequestConflict"].includes((error as Error).name)) throw error;
      }
    }
    await mkdir(folder, { recursive: true });
    await writeFile(resolve(folder, "cloud-publication.json"), JSON.stringify({ region: "us-east-1", inputBucket: input, siteBucket: site, jobId: job.id, status: job.status }));
  } finally { s3.destroy(); }
}
