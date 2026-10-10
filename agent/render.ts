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

const execute = promisify(execFile);
const VOICE = "Microsoft Huihui Desktop" as const;
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
    "Style: Caption,Microsoft YaHei,25,&H00FFFFFF,&H00FFFFFF,&H00251A0D,&H90251A0D,0,0,0,0,100,100,0,0,3,8,0,2,64,64,38,1",
    "Style: Label,Microsoft YaHei,20,&H00FFFFFF,&H00FFFFFF,&H00251A0D,&H00251A0D,0,0,0,0,100,100,0,0,1,1,0,7,20,20,20,1",
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
  line(0, duration, "Label", "{\\pos(24,24)}COURTSIDE  /  AI 解说 · 待复核");
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
      `{\\pos(930,169)\\fs14}${data.source === "existing_catalog" ? "NBA 官方记录 · 非模型预测" : "上传数据 · 来源待核验"}`,
    );
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
): Promise<FilmArtifact> {
  const binary = config.ffmpegPath ?? ffmpeg;
  if (!binary)
    throw new AgentError("DECODER_UNAVAILABLE", "未找到视频编码器。", 503);
  const folder = resolve(config.dataDir, "artifacts", jobId);
  await mkdir(folder, { recursive: true });
  await mkdir(resolve(folder, "fonts"), { recursive: true });
  try {
    await copyFile(
      "C:/Windows/Fonts/msyh.ttc",
      resolve(folder, "fonts", "msyh.ttc"),
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
    buildAss(cues, data, info.duration),
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
  args.push(
    "-filter_complex",
    filters.join(";"),
    "-vf",
    "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,ass=filename=captions.ass:fontsdir=fonts",
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
  } catch {
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
    voice: VOICE,
    cues,
    data,
  };
}
