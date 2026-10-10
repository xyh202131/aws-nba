import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import {
  open,
  mkdir,
  readFile,
  writeFile,
  unlink,
  readdir,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import type { IncomingMessage } from "node:http";
import ffmpeg from "ffmpeg-static";
import type { Config } from "./config.ts";
import type { MatchData } from "../shared/agent.ts";
import { AgentError } from "./errors.ts";
import { alignMatchData, normalizeMatchData } from "./match-data.ts";

const execute = promisify(execFile);
export const MAX_VIDEO_BYTES = 512 * 1024 * 1024;
// Uploaded files may contain playlists. Limit demuxers and protocols before opening them.
export const VIDEO_INPUT_OPTIONS = [
  "-protocol_whitelist",
  "file,pipe",
  "-format_whitelist",
  "mov,mp4,m4a,3gp,3g2,mj2,matroska,webm,avi,mpeg,mpegts,flv,asf,ogg",
];
export const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export type MediaInfo = {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
};
export type UploadedMedia = MediaInfo & {
  id: string;
  bytes: number;
  sha256: string;
};
export type Material = {
  id: string;
  title: string;
  upload: UploadedMedia;
  data: MatchData;
};

export async function fileHash(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
export async function probeMedia(
  path: string,
  config: Config,
): Promise<MediaInfo> {
  const binary = config.ffmpegPath ?? ffmpeg;
  if (!binary)
    throw new AgentError("DECODER_UNAVAILABLE", "未找到视频解码器。", 503);
  let log = "";
  try {
    const result = await execute(
      binary,
      [
        "-hide_banner",
        "-nostdin",
        ...VIDEO_INPUT_OPTIONS,
        "-i",
        path,
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
        "-f",
        "null",
        "-",
      ],
      { timeout: 30_000, maxBuffer: 500_000, windowsHide: true },
    );
    log = result.stderr;
  } catch {
    throw new AgentError(
      "INVALID_VIDEO",
      "文件不是可解码的比赛视频，或首帧无法读取。",
    );
  }
  const duration = log.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  const stream = log.match(/Stream[^\n]*Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/);
  if (!duration || !stream)
    throw new AgentError("INVALID_VIDEO", "无法确认视频时长或尺寸。");
  const seconds =
    Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
  if (
    seconds < 5 ||
    seconds > 900 ||
    Number(stream[1]) > 4096 ||
    Number(stream[2]) > 4096
  )
    throw new AgentError(
      "VIDEO_LIMIT",
      "本版接受 5–900 秒、长宽不超过 4096 的视频；长视频采用稀疏证据帧分析。",
    );
  return {
    duration: seconds,
    width: Number(stream[1]),
    height: Number(stream[2]),
    hasAudio: /Stream[^\n]*Audio:/.test(log),
  };
}
export async function receiveVideo(
  req: IncomingMessage,
  config: Config,
): Promise<UploadedMedia> {
  if (
    !/^(video\/[a-z0-9.+-]+|application\/octet-stream)(;|$)/i.test(
      req.headers["content-type"] ?? "",
    )
  )
    throw new AgentError("CONTENT_TYPE", "上传端点仅接受视频二进制。", 415);
  if (Number(req.headers["content-length"] ?? 0) > MAX_VIDEO_BYTES)
    throw new AgentError("VIDEO_TOO_LARGE", "视频超过 512 MB。", 413);
  const folder = resolve(config.dataDir, "uploads");
  await mkdir(folder, { recursive: true });
  if ((await readdir(folder)).filter((f) => f.endsWith(".json")).length >= 100)
    throw new AgentError(
      "UPLOAD_LIMIT",
      "本机已保留 100 个视频，请先归档。",
      429,
    );
  const id = randomUUID();
  const path = resolve(folder, `${id}.video`);
  const handle = await open(path, "wx");
  const hash = createHash("sha256");
  let bytes = 0;
  try {
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > MAX_VIDEO_BYTES)
        throw new AgentError("VIDEO_TOO_LARGE", "视频超过 512 MB。", 413);
      hash.update(chunk);
      await handle.writeFile(chunk);
    }
    await handle.close();
    const info = await probeMedia(path, config);
    const upload = { id, bytes, sha256: hash.digest("hex"), ...info };
    await writeFile(resolve(folder, `${id}.json`), JSON.stringify(upload));
    return upload;
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(path).catch(() => {}); // Exact, server-generated incomplete upload only.
    throw error;
  }
}
export async function registerMaterial(
  value: unknown,
  config: Config,
): Promise<Material> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AgentError("INVALID_REQUEST", "素材请求必须为对象。");
  const r = value as Record<string, unknown>;
  if (typeof r.uploadId !== "string" || !UUID.test(r.uploadId))
    throw new AgentError("UNKNOWN_UPLOAD", "需要已上传视频 ID。");
  let upload: UploadedMedia;
  try {
    upload = JSON.parse(
      await readFile(
        resolve(config.dataDir, "uploads", `${r.uploadId}.json`),
        "utf8",
      ),
    );
  } catch {
    throw new AgentError("UNKNOWN_UPLOAD", "上传视频不存在。", 404);
  }
  const data = alignMatchData(
    normalizeMatchData(
      r.data,
      upload.duration,
      typeof r.dataClipId === "string" ? r.dataClipId : undefined,
    ),
    r.alignments,
    upload.duration,
  );
  if (!data.events.some((e) => e.videoTimeSeconds !== null))
    throw new AgentError(
      "DATA_ALIGNMENT_REQUIRED",
      "数据没有视频秒数，请至少为一条记录建立时间对应关系。",
    );
  const title =
    typeof r.title === "string" ? r.title.trim().slice(0, 120) : "上传比赛片段";
  const material = {
    id: randomUUID(),
    title: title || "上传比赛片段",
    upload,
    data,
  };
  await mkdir(resolve(config.dataDir, "materials"), { recursive: true });
  await writeFile(
    resolve(config.dataDir, "materials", `${material.id}.json`),
    JSON.stringify(material, null, 2),
  );
  return material;
}
export async function loadUploadedMaterial(id: string, config: Config) {
  if (!UUID.test(id)) throw new AgentError("UNKNOWN_CLIP", "素材 ID 无效。");
  let material: Material;
  try {
    material = JSON.parse(
      await readFile(
        resolve(config.dataDir, "materials", `${id}.json`),
        "utf8",
      ),
    );
  } catch {
    throw new AgentError("UNKNOWN_CLIP", "已注册素材不存在。", 404);
  }
  if (material.id !== id || !UUID.test(material.upload.id))
    throw new AgentError("STORE_CORRUPT", "素材记录损坏。", 500);
  const videoPath = resolve(
    config.dataDir,
    "uploads",
    `${material.upload.id}.video`,
  );
  if ((await fileHash(videoPath)) !== material.upload.sha256)
    throw new AgentError("MEDIA_HASH_MISMATCH", "上传视频哈希发生变化。", 409);
  return { material, videoPath };
}
