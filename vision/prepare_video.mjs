// Local A/B preparation only: preserve original frames/resolution; never claim AI super-resolution.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import ffmpeg from "ffmpeg-static";
import { fileHash, probeMedia, VIDEO_INPUT_OPTIONS } from "../agent/media.ts";
import { loadConfig } from "../agent/config.ts";

const source = process.argv[2];
if (!source || /^\w+:\/\//.test(source))
  throw new Error("Pass an existing local video file");
const input = resolve(source),
  config = loadConfig({});
const info = await probeMedia(input, config);
const folder = resolve(
  process.argv[3] || ".local/video-preparation",
  randomUUID(),
);
await mkdir(folder, { recursive: true });
const execute = promisify(execFile);
const filters = {
  native: "scale=w=iw*sar:h=ih,setsar=1",
  light: "scale=w=iw*sar:h=ih,setsar=1,hqdn3d=1:1:3:3,unsharp=5:5:0.3:3:3:0",
};
const records = [];
for (const [name, filter] of Object.entries(filters)) {
  const output = resolve(folder, `${name}.mp4`),
    start = performance.now();
  await execute(
    config.ffmpegPath || ffmpeg,
    [
      "-hide_banner",
      "-nostdin",
      "-loglevel",
      "error",
      ...VIDEO_INPUT_OPTIONS,
      "-i",
      input,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-vf",
      filter,
      "-fps_mode",
      "passthrough",
      "-enc_time_base",
      "demux",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-threads",
      "2",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      "-n",
      output,
    ],
    { timeout: 600000, maxBuffer: 1000000, windowsHide: true },
  );
  records.push({
    name,
    file: output,
    filter,
    sha256: await fileHash(output),
    bytes: (await stat(output)).size,
    wallSeconds: Number(((performance.now() - start) / 1000).toFixed(3)),
  });
}
const report = {
  schemaVersion: "courtside.video-preparation.v1",
  source: {
    path: input,
    sha256: await fileHash(input),
    bytes: (await stat(input)).size,
    ...info,
  },
  purpose:
    "Native-resolution A/B only; not AI upscaling, not a narrated film. Original is untouched.",
  policy: {
    newFrames: false,
    forceFps: false,
    crf: 18,
    preset: "veryfast",
    threads: 2,
    defaultSelection: "original",
  },
  outputs: records,
};
await writeFile(
  resolve(folder, "preparation.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ folder, ...report }, null, 2));
