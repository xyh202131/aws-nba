import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import ffmpeg from "ffmpeg-static";
import type { AgentFrame } from "../shared/agent.ts";
import type { Clip } from "../src/data.ts";
import type { Config } from "./config.ts";
import { sha256 } from "./catalog.ts";
import { AgentError } from "./errors.ts";

const execute = promisify(execFile);
export async function extractFrames(
  clip: Clip,
  videoPath: string,
  jobId: string,
  config: Config,
): Promise<AgentFrame[]> {
  const binary = config.ffmpegPath ?? ffmpeg;
  if (!binary)
    throw new AgentError(
      "DECODER_UNAVAILABLE",
      "未找到视频解码器，请配置 FFMPEG_PATH。",
      503,
    );
  const folder = resolve(config.dataDir, "frames", jobId);
  await mkdir(folder, { recursive: true });
  const frames: AgentFrame[] = [];
  for (let index = 0; index < clip.moments.length; index++) {
    const time = clip.moments[index]!.time;
    const filename = `${index}.jpg`;
    const output = resolve(folder, filename);
    // Argument arrays, fixed catalog paths, no shell or user-provided command fragments.
    let stderr: string;
    try {
      const result = await execute(
        binary,
        [
          "-hide_banner",
          "-nostdin",
          "-nostats",
          "-loglevel",
          "info",
          "-i",
          videoPath,
          "-vf",
          `select=gte(t\\,${time.toFixed(6)}),showinfo,scale=960:-2`,
          "-frames:v",
          "1",
          "-q:v",
          "3",
          "-y",
          output,
        ],
        { timeout: 30_000, maxBuffer: 2_000_000, windowsHide: true },
      );
      stderr = result.stderr;
    } catch {
      throw new AgentError(
        "FRAME_EXTRACTION_FAILED",
        "证据帧提取失败；请核对解码器及本地素材。",
        500,
      );
    }
    const match = stderr.match(/pts_time:\s*([0-9.]+)/);
    if (!match)
      throw new AgentError(
        "FRAME_TIMESTAMP_MISSING",
        "无法确认解码帧的真实时间，停止生成结果。",
        500,
      );
    const actualTime = Number(match[1]);
    if (Math.abs(actualTime - time) > 0.15)
      throw new AgentError(
        "FRAME_TIME_MISMATCH",
        "解码时间与请求位置不一致。",
        500,
      );
    const bytes = await readFile(output);
    frames.push({
      id: `${clip.id}:frame:${index}`,
      requestedTime: time,
      time: actualTime,
      sha256: sha256(bytes),
      image: `/api/jobs/${jobId}/frames/${filename}`,
    });
  }
  return frames;
}
