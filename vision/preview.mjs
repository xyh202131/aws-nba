// Local developer CLI. HTTP clients cannot supply a filesystem path to this tool.
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import ffmpeg from "ffmpeg-static";
import { loadConfig } from "../agent/config.ts";
import { fileHash, probeMedia, VIDEO_INPUT_OPTIONS } from "../agent/media.ts";
import { runTracking } from "../agent/tracking.ts";
import { buildAss } from "../agent/render.ts";

const video = process.argv[2];
if (!video || /^\w+:\/\//.test(video)) throw new Error("Pass an existing local video file, not a URL");
const path = resolve(video);
const config = loadConfig({ AGENT_DATA_DIR:process.argv[3] || ".local/tracking-preview" });
const id = randomUUID();
const info = await probeMedia(path,config);
const result = await runTracking(path,await fileHash(path),info,id,config);
const folder = resolve(config.dataDir,"artifacts",id);
await mkdir(resolve(folder,"fonts"),{recursive:true});
if (process.platform === "win32") await copyFile("C:/Windows/Fonts/msyh.ttc",resolve(folder,"fonts/msyh.ttc"));
const data = { schemaVersion:"courtside.match-data.v1",source:"uploaded",events:[],warnings:[] };
await writeFile(resolve(folder,"tracking.ass"),buildAss([],data,info.duration,result.timeline));
await promisify(execFile)(config.ffmpegPath || ffmpeg,["-hide_banner","-nostdin","-loglevel","error",...VIDEO_INPUT_OPTIONS,"-i",path,"-vf","scale=w=iw*sar:h=ih,setsar=1,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,ass=filename=tracking.ass:fontsdir=fonts","-map","0:v:0","-map","0:a?","-c:v","libx264","-crf","22","-preset","veryfast","-threads","2","-c:a","aac","-movflags","+faststart","-t",String(info.duration),"-y","tracking-preview.mp4"],{cwd:folder,timeout:600000,maxBuffer:1000000,windowsHide:true});
console.log(JSON.stringify({ id,folder,video:resolve(folder,"tracking-preview.mp4"),manifest:result.manifest,previewSha256:await fileHash(resolve(folder,"tracking-preview.mp4")) },null,2));
