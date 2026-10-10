// Local HD engineering acceptance. Narration is explicitly scripted; no model call.
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { loadConfig } from "../agent/config.ts";
import { fileHash, probeMedia } from "../agent/media.ts";
import {
  validateTrackingManifest,
  validateTrackingRows,
} from "../agent/tracking.ts";
import { compileTrackingOverlays } from "../shared/tracking.ts";
import { renderFilm } from "../agent/render.ts";

const [video, trackingFolder, destination] = process.argv.slice(2);
if (!video || !trackingFolder || !destination)
  throw Error(
    "Pass local video, validated tracking folder and a private output directory",
  );
const source = resolve(video),
  folder = resolve(trackingFolder);
const manifest = JSON.parse(
  await readFile(resolve(folder, "tracking-manifest.json"), "utf8"),
);
const hash = await fileHash(source);
validateTrackingManifest(manifest, hash, manifest.duration);
const bytes = await readFile(resolve(folder, "tracks.jsonl"), "utf8");
if (
  (await fileHash(resolve(folder, "tracks.jsonl"))) !==
  manifest.files.tracks.sha256
)
  throw Error("Track file hash differs");
const rows = validateTrackingRows(
  bytes
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line)),
  manifest,
);
const timeline = compileTrackingOverlays(rows, manifest);
const config = loadConfig({
  AGENT_PROVIDER: "fixture",
  AGENT_DATA_DIR: destination,
  FILM_RESOLUTION: "source",
});
const info = await probeMedia(source, config);
if (manifest.duration > info.duration)
  throw Error("Tracking extends beyond video");
const data = {
  schemaVersion: "courtside.match-data.v1",
  source: "uploaded",
  warnings: ["工程视频元数据，非 NBA 比赛指标"],
  events: [
    {
      id: "engineering-source",
      recordId: "engineering-source",
      videoTimeSeconds: 2.5,
      playerName: "工程验证",
      description: `${manifest.stats.processed_frames}帧 · ${manifest.source_fps.toFixed(2)}fps`,
      xfgPercent: null,
      sourceUrl: null,
    },
  ],
};
const cues = [
  {
    text: "工程验收播报",
    time: 0.4,
    evidenceIds: [],
    start: 0.4,
    end: 4.8,
    narration: "这是原生高清成片工程验证。",
    dataEventIds: ["engineering-source"],
  },
];
const id = randomUUID();
const film = await renderFilm(
  "原生高清工程验证",
  source,
  { ...info, duration: manifest.duration },
  cues,
  data,
  id,
  config,
  {
    timeline,
    artifact: {
      status: "completed",
      source: "pretrained_inference",
      model: manifest.model.name,
      modelSha256: manifest.model.sha256,
      configSha256: manifest.config_sha256,
      processedFrames: manifest.stats.processed_frames,
      framesWithTracks: manifest.stats.frames_with_tracks,
      uniqueTracks: manifest.stats.unique_tracks,
      segmentCount: manifest.segments.length,
      identityStatus: "unconfirmed",
      manifest: "local-validation",
      tracks: "local-validation",
      identityLinks: "not-confirmed",
      eventLinks: "not-bound",
      overlays: "local-validation",
      resources: manifest.resources,
    },
  },
  { provider: "fixture" },
);
const record = {
  schemaVersion: "courtside.hd-engineering-acceptance.v1",
  id,
  inputSha256: hash,
  trackingManifestSha256: await fileHash(
    resolve(folder, "tracking-manifest.json"),
  ),
  modelCalls: 0,
  awsResourcesCreated: 0,
  narrationKind: "scripted_engineering_acceptance_not_model_generated",
  dataKind: "measured_video_metadata_not_nba_event",
  film,
  output: resolve(config.dataDir, "artifacts", id, "film.mp4"),
};
await writeFile(
  resolve(config.dataDir, "artifacts", id, "engineering-acceptance.json"),
  JSON.stringify(record, null, 2),
);
console.log(JSON.stringify(record, null, 2));
