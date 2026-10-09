import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { Clip } from "../src/data.ts";
import { ROOT } from "./config.ts";
import { AgentError } from "./errors.ts";

export const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export async function loadMaterial(clipId: string) {
  const clips = JSON.parse(
    await readFile(resolve(ROOT, "src/data/clips.json"), "utf8"),
  ) as Clip[];
  const manifests = JSON.parse(
    await readFile(resolve(ROOT, "docs/media-manifest.json"), "utf8"),
  ) as { clip_id: string; sha256: string }[];
  const clip = clips.find((c) => c.id === clipId);
  const manifest = manifests.find((m) => m.clip_id === clipId);
  if (!clip || !manifest)
    throw new AgentError("UNKNOWN_CLIP", "素材目录中找不到此回合。");
  const videoPath = resolve(ROOT, "public", clip.video);
  const previewSha256 = sha256(await readFile(videoPath));
  if (previewSha256 !== manifest.sha256)
    throw new AgentError(
      "MEDIA_HASH_MISMATCH",
      "预览视频哈希与素材台账不一致，请重新核验素材。",
      409,
    );
  return { clip, videoPath, previewSha256 };
}
