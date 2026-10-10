import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, copyFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import ffmpeg from "ffmpeg-static";
import type { FilmArtifact, MatchData, NarrationCue } from "../shared/agent.ts";
import type { Config } from "./config.ts";
import type { MediaInfo } from "./media.ts";
import { fileHash, VIDEO_INPUT_OPTIONS } from "./media.ts";
import { AgentError } from "./errors.ts";
import { dataOverlays } from "../shared/film.ts";
import type { OverlayTimeline, TrackingArtifact } from "../shared/tracking.ts";
import { synthesizePolly } from "./polly.ts";

const execute = promisify(execFile);
const VOICE = "Microsoft Huihui Desktop" as const;
export function videoRenderSettings(
  info: MediaInfo,
  tracking: OverlayTimeline | undefined,
  resolution: "720p" | "source" = "720p",
) {
  let width = 1280,
    height = 720;
  // The current ASS design uses a 16:9 coordinate canvas. Only promote a verified
  // display plane with that aspect ratio; encoded dimensions alone omit SAR/rotation.
  if (
    resolution === "source" &&
    tracking &&
    Number.isSafeInteger(tracking.sourceWidth) &&
    Number.isSafeInteger(tracking.sourceHeight) &&
    tracking.sourceWidth >= 32 &&
    tracking.sourceHeight >= 32 &&
    Math.abs(tracking.sourceWidth / tracking.sourceHeight - 16 / 9) < 0.001
  ) {
    const factor = Math.min(
      1,
      1920 / tracking.sourceWidth,
      1080 / tracking.sourceHeight,
    );
    width = 2 * Math.floor((tracking.sourceWidth * factor) / 2);
    height = 2 * Math.floor((tracking.sourceHeight * factor) / 2);
  }
  return {
    width,
    height,
    mode: resolution,
    encodedWidth: info.width,
    encodedHeight: info.height,
    filter: `scale=w=iw*sar:h=ih,setsar=1,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
  };
}

export function assText(text: string) {
  return text
    .replace(/\\/g, "＼")
    .replace(/{/g, "｛")
    .replace(/}/g, "｝")
    .replace(/[\r\n\x00-\x1f]/g, " ");
}
const assTime = (s: number) => {
  const cs = Math.floor(s * 100);
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};
const vttTime = (s: number) => {
  const ms = Math.round(s * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
};

export function buildAss(
  cues: NarrationCue[],
  data: MatchData,
  duration: number,
  tracking?: OverlayTimeline,
  narrationProvider: "fixture" | "bedrock" = "bedrock",
) {
  const rows = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1280",
    "PlayResY: 720",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Caption,${process.platform === "win32" ? "Microsoft YaHei" : "Noto Sans CJK SC"},25,&H00FFFFFF,&H00FFFFFF,&H00251A0D,&H90251A0D,0,0,0,0,100,100,0,0,3,8,0,2,64,64,38,1`,
    `Style: Label,${process.platform === "win32" ? "Microsoft YaHei" : "Noto Sans CJK SC"},20,&H00FFFFFF,&H00FFFFFF,&H00251A0D,&H00251A0D,0,0,0,0,100,100,0,0,1,1,0,7,20,20,20,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const line = (
    start: number,
    end: number,
    style: string,
    text: string,
    layer = 1,
  ) =>
    rows.push(
      `Dialogue: ${layer},${assTime(start)},${assTime(end)},${style},,0,0,0,,${text}`,
    );
  const shape = (
    start: number,
    end: number,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
  ) =>
    line(
      start,
      end,
      "Label",
      `{\\an7\\pos(${x},${y})\\bord0\\shad0\\1c${color}\\p1}m 0 0 l ${w} 0 ${w} ${h} 0 ${h}{\\p0}`,
      0,
    );
  line(
    0,
    duration,
    "Label",
    `{\\pos(24,24)}COURTSIDE  /  ${cues.length ? (narrationProvider === "fixture" ? "离线演示解说 · 真实追踪另计" : "AI 解说 · 待复核") : "匿名人物追踪 · 预训练推理"}`,
  );
  for (const cue of cues) {
    const escaped = assText(cue.narration);
    const chunks = escaped.match(/.{1,38}/gu) ?? [];
    line(cue.start, cue.end, "Caption", chunks.join("\\N"));
  }
  for (const { event, start, end } of dataOverlays(data, duration)) {
    shape(start, end, 916, 68, 340, 134, "&H251A0D&");
    line(
      start,
      end,
      "Label",
      `{\\pos(930,80)}${assText((event.playerName || "数据事件") + " · " + event.description).slice(0, 24)}`,
    );
    line(
      start,
      end,
      "Label",
      `{\\pos(930,114)\\1c&HDEECD3&}${event.xfgPercent === null ? "事件已关联视频时间" : `预期命中率  ${event.xfgPercent}%`}`,
    );
    if (event.xfgPercent !== null) {
      shape(start, end, 932, 149, 300, 8, "&H67523E&");
      const width = Math.round((300 * event.xfgPercent) / 100);
      if (width) shape(start, end, 932, 149, width, 8, "&HDCC278&");
    }
    line(
      start,
      end,
      "Label",
      `{\\pos(930,169)\\fs14}${tracking ? `未绑定画面人物 · ${data.source === "existing_catalog" ? "NBA 官方记录" : "来源待核验"}` : data.source === "existing_catalog" ? "NBA 官方记录 · 非模型预测" : "上传数据 · 来源待核验"}`,
    );
  }
  if (tracking) {
    const scale = Math.min(
      1280 / tracking.sourceWidth,
      720 / tracking.sourceHeight,
    );
    const ox = (1280 - scale * tracking.sourceWidth) / 2,
      oy = (720 - scale * tracking.sourceHeight) / 2;
    const num = (v: number) => Number(v.toFixed(2));
    const point = (p: [number, number]) =>
      [num(p[0] * scale + ox), num(p[1] * scale + oy)] as [number, number];
    const polygon = (points: [number, number][]) =>
      `m ${points[0]!.join(" ")} l ${points
        .slice(1)
        .map((p) => p.join(" "))
        .join(" ")}`;
    for (const f of tracking.frames) {
      const [x1, y1] = point([f.bbox[0], f.bbox[1]]),
        [x2, y2] = point([f.bbox[2], f.bbox[3]]);
      const paths = [
        polygon([
          [x1, y1],
          [x2, y1],
          [x2, y1 + 2],
          [x1, y1 + 2],
        ]),
        polygon([
          [x1, y2 - 2],
          [x2, y2 - 2],
          [x2, y2],
          [x1, y2],
        ]),
        polygon([
          [x1, y1],
          [x1 + 2, y1],
          [x1 + 2, y2],
          [x1, y2],
        ]),
        polygon([
          [x2 - 2, y1],
          [x2, y1],
          [x2, y2],
          [x2 - 2, y2],
        ]),
      ];
      const trail = f.trail
        .filter((_, i) => i === 0 || i === f.trail.length - 1 || i % 4 === 0)
        .map(point);
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1]!,
          b = trail[i]!,
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          length = Math.hypot(dx, dy);
        if (length < 1) continue;
        const nx = num(-dy / length),
          ny = num(dx / length);
        paths.push(
          polygon([
            [a[0] + nx, a[1] + ny],
            [b[0] + nx, b[1] + ny],
            [b[0] - nx, b[1] - ny],
            [a[0] - nx, a[1] - ny],
          ]),
        );
      }
      if (f.anchor) {
        const [x, y] = point(f.anchor);
        paths.push(
          polygon([
            [x, y - 4],
            [x + 4, y],
            [x, y + 4],
            [x - 4, y],
          ]),
        );
      }
      line(
        f.start,
        f.end,
        "Label",
        `{\\an7\\pos(0,0)\\bord0\\shad0\\1c&HDCC278&\\p1}${paths.join(" ")}{\\p0}`,
        2,
      );
      line(
        f.start,
        f.end,
        "Label",
        `{\\pos(${num(Math.min(1210, Math.max(0, x1)))},${num(Math.max(2, y1 - 21))})\\fs16\\1c&HDCC278&}${assText(f.label)}`,
        3,
      );
    }
  }
  return rows.join("\n") + "\n";
}
function wavDuration(bytes: Buffer) {
  if (
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WAVE"
  )
    throw new AgentError("VOICE_FAILED", "语音引擎未生成有效 WAV。", 500);
  let rate = 0;
  let size = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const tag = bytes.toString("ascii", offset, offset + 4);
    const n = bytes.readUInt32LE(offset + 4);
    if (tag === "fmt " && n >= 16) rate = bytes.readUInt32LE(offset + 16);
    if (tag === "data") size = n;
    offset += 8 + n + (n % 2);
  }
  if (!rate || !size)
    throw new AgentError("VOICE_FAILED", "解说音轨为空。", 500);
  return size / rate;
}
async function synthesize(cues: NarrationCue[], folder: string) {
  if (process.env.TTS_PROVIDER === "polly") {
    if (process.env.AGENT_RUNTIME_CONTAINER !== "true" || process.env.AWS_AUTH_MODE !== "execution_role")
      throw new AgentError("PROJECT_BOUNDARY", "Polly 仅允许授权的云端执行角色调用。", 403);
    return synthesizePolly(cues, folder);
  }
  if (process.platform !== "win32")
    throw new AgentError(
      "VOICE_UNAVAILABLE",
      "当前本地语音适配器需要 Windows 中文 Huihui；云端语音适配器尚未接入。",
      503,
    );
  const tasks = cues.map((cue, i) => ({
    text: cue.narration,
    output: resolve(folder, `voice-${i}.wav`),
  }));
  await writeFile(
    resolve(folder, "voice-input.json"),
    JSON.stringify(tasks),
    "utf8",
  );
  // Text is read as JSON data, never evaluated or interpolated into PowerShell code.
  await writeFile(
    resolve(folder, "speak.ps1"),
    `param([string]$Manifest)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$items = Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($item in $items) {
  $speaker = [System.Speech.Synthesis.SpeechSynthesizer]::new()
  try {
    $speaker.SelectVoice('Microsoft Huihui Desktop')
    $speaker.Rate = 1
    $speaker.SetOutputToWaveFile($item.output)
    $speaker.Speak($item.text)
  } finally { $speaker.Dispose() }
}
`,
    "utf8",
  );
  try {
    await execute(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-File",
        resolve(folder, "speak.ps1"),
        "-Manifest",
        resolve(folder, "voice-input.json"),
      ],
      { timeout: 90_000, maxBuffer: 300_000, windowsHide: true },
    );
  } catch {
    throw new AgentError(
      "VOICE_UNAVAILABLE",
      "中文语音生成失败，请检查 Huihui 引擎；本次模型响应仍保留，不会自动重调。",
      503,
    );
  }
  return Promise.all(
    tasks.map(async (task) => ({
      path: task.output,
      duration: wavDuration(await readFile(task.output)),
    })),
  );
}

export async function renderFilm(
  title: string,
  videoPath: string,
  info: MediaInfo,
  cues: NarrationCue[],
  data: MatchData,
  jobId: string,
  config: Config,
  tracking?: { artifact: TrackingArtifact; timeline: OverlayTimeline },
  narrationSource: FilmArtifact["narrationSource"] = {
    provider: config.provider,
  },
): Promise<FilmArtifact> {
  const binary = config.ffmpegPath ?? ffmpeg;
  if (!binary)
    throw new AgentError("DECODER_UNAVAILABLE", "未找到视频编码器。", 503);
  const folder = resolve(config.dataDir, "artifacts", jobId);
  await mkdir(folder, { recursive: true });
  await mkdir(resolve(folder, "fonts"), { recursive: true });
  try {
    await copyFile(
      process.env.FILM_FONT_PATH || "C:/Windows/Fonts/msyh.ttc",
      resolve(folder, "fonts", "chinese.ttc"),
    );
  } catch {
    throw new AgentError(
      "FONT_UNAVAILABLE",
      "找不到用于中文成片的微软雅黑字体。",
      503,
    );
  }
  await writeFile(
    resolve(folder, "captions.ass"),
    buildAss(
      cues,
      data,
      info.duration,
      tracking?.timeline,
      narrationSource.provider,
    ),
  );
  await writeFile(
    resolve(folder, "captions.vtt"),
    "WEBVTT\n\n" +
      cues
        .map(
          (c, i) =>
            `${i + 1}\n${vttTime(c.start)} --> ${vttTime(c.end)}\n${c.narration.replace(/[<>]/g, "")}\n`,
        )
        .join("\n"),
  );
  await writeFile(
    resolve(folder, "timeline.json"),
    JSON.stringify(
      {
        schemaVersion: "courtside.film-timeline.v1",
        title,
        duration: info.duration,
        cues,
        data,
        ...(tracking ? { tracking: tracking.artifact } : {}),
        narrationSource,
      },
      null,
      2,
    ),
  );
  const voices = await synthesize(cues, folder);
  const args = [
    "-hide_banner",
    "-nostdin",
    "-loglevel",
    "error",
    ...VIDEO_INPUT_OPTIONS,
    "-i",
    videoPath,
  ];
  voices.forEach((v) => args.push("-i", v.path));
  const filters = [
    info.hasAudio
      ? "[0:a:0]aresample=48000,volume=0.18[bg]"
      : `anullsrc=r=48000:cl=stereo:d=${info.duration}[bg]`,
  ];
  voices.forEach((voice, i) => {
    const cue = cues[i]!;
    const tempo = Math.max(1, voice.duration / (cue.end - cue.start - 0.15));
    if (tempo > 2.5)
      throw new AgentError(
        "VOICE_WINDOW_TOO_SHORT",
        "解说超过时间段容量，请缩短视频数据文案后重新生成。",
        422,
      );
    filters.push(
      `[${i + 1}:a]atempo=${tempo.toFixed(6)},adelay=${Math.round(cue.start * 1000)}:all=1,apad=whole_dur=${info.duration}[voice${i}]`,
    );
  });
  filters.push(
    `[bg]${voices.map((_, i) => `[voice${i}]`).join("")}amix=inputs=${voices.length + 1}:duration=longest:normalize=0,alimiter=limit=0.95[audio]`,
  );
  const output = resolve(folder, "film.mp4");
  const videoSettings = videoRenderSettings(
    info,
    tracking?.timeline,
    config.filmResolution,
  );
  args.push(
    "-filter_complex",
    filters.join(";"),
    "-vf",
    `${videoSettings.filter},ass=filename=captions.ass:fontsdir=fonts`,
    "-map",
    "0:v:0",
    "-map",
    "[audio]",
    "-t",
    String(info.duration),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "22",
    "-threads",
    "2",
    "-fps_mode",
    "passthrough",
    "-enc_time_base:v",
    "-1",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    "-y",
    output,
  );
  try {
    await execute(binary, args, {
      cwd: folder,
      timeout: 600_000,
      maxBuffer: 500_000,
      windowsHide: true,
    });
  } catch (failure) {
    const stderr = (failure as { stderr?: unknown })?.stderr;
    await writeFile(
      resolve(folder, "render-error.json"),
      JSON.stringify({
        code: "RENDER_FAILED",
        stderr: typeof stderr === "string" ? stderr.slice(-8000) : null,
      }),
    );
    throw new AgentError(
      "RENDER_FAILED",
      "字幕、数据图形或音轨合成失败；模型记录已保留。",
      500,
    );
  }
  return {
    title,
    duration: info.duration,
    video: `/api/jobs/${jobId}/artifacts/film.mp4`,
    captions: `/api/jobs/${jobId}/artifacts/captions.vtt`,
    timeline: `/api/jobs/${jobId}/artifacts/timeline.json`,
    sha256: await fileHash(output),
    bytes: (await stat(output)).size,
    voice: process.env.TTS_PROVIDER === "polly" ? "Amazon Polly Zhiyu neural" : VOICE,
    cues,
    data,
    ...(tracking ? { tracking: tracking.artifact } : {}),
    narrationSource,
    videoSettings: {
      width: videoSettings.width,
      height: videoSettings.height,
      timing: "source_pts_passthrough",
    },
  };
}
