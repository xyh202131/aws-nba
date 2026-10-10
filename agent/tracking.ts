import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import type { Config } from "./config.ts";
import type { MediaInfo } from "./media.ts";
import { fileHash } from "./media.ts";
import { AgentError } from "./errors.ts";
import {
  compileTrackingOverlays,
  compileTrackIndex,
  type TrackObservation,
  type TrackingArtifact,
  type TrackingManifest,
} from "../shared/tracking.ts";
import { ROOT } from "./config.ts";

const execute = promisify(execFile);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const hashPattern = /^[a-f0-9]{64}$/;
function invalid(): never {
  throw new AgentError(
    "INVALID_TRACKING",
    "追踪产物的时间、坐标、哈希或状态无效。",
    422,
  );
}

export function validateTrackingManifest(
  value: unknown,
  videoHash: string,
  duration: number,
): TrackingManifest {
  if (!value || typeof value !== "object") invalid();
  const m = value as TrackingManifest;
  if (
    m.schema_version !== "courtside.tracking-manifest.v1" ||
    m.source !== "pretrained_inference" ||
    m.video_sha256 !== videoHash ||
    !hashPattern.test(videoHash) ||
    !finite(m.duration) ||
    Math.abs(m.duration - duration) > 0.001 ||
    !Number.isInteger(m.width) ||
    !Number.isInteger(m.height) ||
    m.width < 1 ||
    m.height < 1 ||
    m.width > 4096 ||
    m.height > 4096 ||
    !finite(m.source_fps) ||
    m.source_fps < 1 ||
    m.source_fps > 240 ||
    !finite(m.processing_fps) ||
    m.processing_fps < 1 ||
    m.processing_fps > m.source_fps + 0.001 ||
    !m.model ||
    !hashPattern.test(m.model.sha256) ||
    !hashPattern.test(m.config_sha256) ||
    !m.files?.tracks ||
    m.files.tracks.name !== "tracks.jsonl" ||
    !hashPattern.test(m.files.tracks.sha256) ||
    !Number.isSafeInteger(m.files.tracks.bytes) ||
    m.files.tracks.bytes < 1 ||
    m.files.tracks.bytes > 100_000_000 ||
    !Array.isArray(m.segments) ||
    !m.segments.length ||
    m.segments.length > 2000 ||
    !m.stats ||
    !Number.isSafeInteger(m.stats.observations) ||
    m.stats.observations < 1 ||
    m.stats.observations > 150000
  )
    invalid();
  const transform = m.transform;
  if (
    !finite(m.time_origin_seconds) ||
    !transform ||
    !Number.isInteger(transform.rotation) ||
    transform.rotation % 90 !== 0 ||
    !finite(transform.sar) ||
    transform.sar < 0.1 ||
    transform.sar > 10 ||
    !Number.isInteger(transform.encoded_width) ||
    !Number.isInteger(transform.encoded_height) ||
    transform.encoded_width < 1 ||
    transform.encoded_width > 4096 ||
    transform.encoded_height < 1 ||
    transform.encoded_height > 4096
  )
    invalid();
  const scaledWidth = Math.round(transform.encoded_width * transform.sar),
    swapped = Math.abs(transform.rotation / 90) % 2 === 1;
  if (
    m.width !== (swapped ? transform.encoded_height : scaledWidth) ||
    m.height !== (swapped ? scaledWidth : transform.encoded_height)
  )
    invalid();
  for (const field of [
    "processed_frames",
    "frames_with_tracks",
    "included_observations",
    "unique_tracks",
    "excluded_observations",
  ] as const)
    if (!Number.isSafeInteger(m.stats[field]) || m.stats[field] < 0) invalid();
  if (
    !m.stats.processed_frames ||
    !m.stats.frames_with_tracks ||
    m.stats.frames_with_tracks > m.stats.processed_frames ||
    m.stats.included_observations > m.stats.observations ||
    m.stats.unique_tracks > m.stats.included_observations ||
    m.stats.excluded_observations > 150000
  )
    invalid();
  const names = new Set<string>();
  let end = 0;
  for (const s of m.segments) {
    if (
      !s ||
      !/^S\d{3,6}$/.test(s.id) ||
      names.has(s.id) ||
      !finite(s.start) ||
      !finite(s.end) ||
      Math.abs(s.start - end) > 0.001 ||
      s.end <= s.start ||
      s.end > duration + 0.001 ||
      s.reason !== (names.size ? "scene_cut" : "start")
    )
      invalid();
    names.add(s.id);
    end = s.end;
  }
  if (Math.abs(end - duration) > 0.001) invalid();
  for (const field of [
    "wall_seconds",
    "cpu_seconds",
    "peak_rss_bytes",
    "output_bytes",
  ] as const)
    if (!m.resources || !finite(m.resources[field]) || m.resources[field] < 0)
      invalid();
  if (
    m.render_policy &&
    (!finite(m.render_policy.trail_seconds) ||
      m.render_policy.trail_seconds < 0 ||
      m.render_policy.trail_seconds > 2 ||
      m.render_policy.position_source !== "detector_measurement" ||
      m.render_policy.interpolation !== false)
  )
    invalid();
  if (
    !m.tracker ||
    m.tracker.name !== "BoT-SORT" ||
    m.tracker.gmc_method !== "sparseOptFlow" ||
    typeof m.tracker.reid !== "boolean" ||
    !finite(m.tracker.buffer_seconds) ||
    m.tracker.buffer_seconds <= 0 ||
    m.tracker.buffer_seconds > 2 ||
    (m.tracker.fuse_score !== undefined &&
      typeof m.tracker.fuse_score !== "boolean") ||
    (m.tracker.association_scope !== undefined &&
      !["floor_qualified", "size_qualified"].includes(
        m.tracker.association_scope,
      ))
  )
    invalid();
  if (m.detection_cache || m.files.detections) {
    const c = m.detection_cache,
      d = m.files.detections;
    if (
      !c ||
      !d ||
      !["hit", "miss"].includes(c.state) ||
      !hashPattern.test(c.key) ||
      !hashPattern.test(c.sha256) ||
      c.frames !== m.stats.processed_frames ||
      !Number.isSafeInteger(c.detections) ||
      c.detections < 0 ||
      c.detections > 150000 ||
      !Number.isSafeInteger(c.bytes) ||
      c.bytes < 1 ||
      c.bytes > 100_000_000 ||
      d.name !== "detections.jsonl" ||
      d.sha256 !== c.sha256 ||
      d.bytes !== c.bytes
    )
      invalid();
  }
  if (m.tracker.reid) {
    const a = m.appearance;
    if (
      !a ||
      a.name !== "YOLO26n-ReID" ||
      !hashPattern.test(a.sha256) ||
      a.provider !== "CPUExecutionProvider" ||
      !finite(a.refresh_seconds) ||
      a.refresh_seconds <= 0 ||
      a.refresh_seconds > 1 ||
      !Number.isSafeInteger(a.inferred_crops) ||
      a.inferred_crops < 1 ||
      !Number.isSafeInteger(a.reused_crops) ||
      a.reused_crops < 0
    )
      invalid();
  } else if (m.appearance) invalid();
  return m;
}

export function validateTrackingRows(
  rows: unknown[],
  manifest: TrackingManifest,
): TrackObservation[] {
  if (
    rows.length !== manifest.stats.observations ||
    !rows.length ||
    rows.length > 150000
  )
    invalid();
  let previous = -1,
    frame = -1;
  let included = 0;
  let keys = new Set<string>();
  const segments = new Map(manifest.segments.map((s) => [s.id, s]));
  for (const value of rows) {
    if (!value || typeof value !== "object") invalid();
    const r = value as TrackObservation;
    const segment = segments.get(r.segment_id);
    if (
      r.schema_version !== "courtside.player-track.v1" ||
      r.video_sha256 !== manifest.video_sha256 ||
      r.coordinate_space !== "source_video_pixels" ||
      r.frame_width !== manifest.width ||
      r.frame_height !== manifest.height ||
      !finite(r.pts_seconds) ||
      r.pts_seconds < previous ||
      r.pts_seconds < 0 ||
      r.pts_seconds >= manifest.duration ||
      !Number.isSafeInteger(r.frame_index) ||
      r.frame_index < 0 ||
      r.frame_index < frame ||
      (frame >= 0 &&
        (r.frame_index === frame) !== (r.pts_seconds === previous)) ||
      !segment ||
      r.pts_seconds < segment.start - 1e-6 ||
      r.pts_seconds >= segment.end ||
      !/^T\d{3,6}$/.test(r.track_id) ||
      !["detected", "lost"].includes(r.status) ||
      typeof r.included !== "boolean" ||
      r.player_id !== null ||
      r.identity_status !== "unconfirmed" ||
      !Array.isArray(r.identity_evidence) ||
      r.identity_evidence.length !== 0 ||
      r.court_xy_m !== null ||
      r.calibration_id !== null ||
      r.anchor_method !== "bbox_bottom_center_approximation"
    )
      invalid();
    if (
      r.source_frame_duration_seconds !== undefined &&
      (!finite(r.source_frame_duration_seconds) ||
        r.source_frame_duration_seconds <= 0 ||
        r.source_frame_duration_seconds > manifest.duration)
    )
      invalid();
    if (r.pts_seconds !== previous) keys = new Set();
    const key = `${r.segment_id}/${r.track_id}`;
    if (keys.has(key)) invalid();
    keys.add(key);
    previous = r.pts_seconds;
    frame = r.frame_index;
    if (r.status === "lost") {
      if (
        r.included ||
        r.bbox_xyxy_px !== null ||
        r.anchor_px !== null ||
        r.detector_score !== null
      )
        invalid();
      continue;
    }
    const box = r.bbox_xyxy_px,
      anchor = r.anchor_px;
    if (
      !Array.isArray(box) ||
      box.length !== 4 ||
      !box.every(finite) ||
      box[0] < 0 ||
      box[1] < 0 ||
      box[2] > manifest.width ||
      box[3] > manifest.height ||
      box[2] <= box[0] ||
      box[3] <= box[1] ||
      !Array.isArray(anchor) ||
      anchor.length !== 2 ||
      !anchor.every(finite) ||
      Math.abs(anchor[0] - (box[0] + box[2]) / 2) > 0.001 ||
      anchor[1] !== box[3] ||
      !finite(r.detector_score) ||
      r.detector_score < 0 ||
      r.detector_score > 1
    )
      invalid();
    if (r.included) included++;
  }
  if (!included || included !== manifest.stats.included_observations) invalid();
  return rows as TrackObservation[];
}

export async function runTracking(
  videoPath: string,
  videoHash: string,
  info: MediaInfo,
  jobId: string,
  config: Config,
) {
  const folder = resolve(config.dataDir, "artifacts", jobId);
  await mkdir(folder, { recursive: true });
  const profilePath = resolve(ROOT, "vision/profile.json"),
    trackerPath = resolve(ROOT, "vision/tracker.yaml");
  let lock: { filename: string; sha256: string };
  let profile: { modelName: string; weightsFile: string };
  try {
    lock = JSON.parse(
      await readFile(resolve(ROOT, "vision/model-lock.json"), "utf8"),
    );
    profile = JSON.parse(await readFile(profilePath, "utf8"));
    if (
      !/^[a-zA-Z0-9._-]+\.pt$/.test(lock.filename) ||
      !hashPattern.test(lock.sha256) ||
      lock.filename !== profile.weightsFile
    )
      invalid();
    await stat(config.visionPython);
    await stat(resolve(config.visionWeightsDir, lock.filename));
  } catch (error) {
    if (error instanceof AgentError) throw error;
    throw new AgentError(
      "TRACKING_UNAVAILABLE",
      "本地视觉工具或权重未准备好，请按 vision/README.md 配置后重试。",
      503,
    );
  }
  const weights = resolve(config.visionWeightsDir, lock.filename);
  if (
    (await fileHash(weights)) !== lock.sha256 ||
    (await fileHash(videoPath)) !== videoHash
  )
    invalid();
  const configHash = createHash("sha256")
    .update(await readFile(profilePath))
    .update(await readFile(trackerPath))
    .digest("hex");
  const toolDigest = createHash("sha256");
  for (const name of ["track.py", "core.py", "detections.py", "appearance.py"])
    toolDigest.update(await readFile(resolve(ROOT, "vision", name)));
  const toolHash = toolDigest.digest("hex");
  try {
    const logs = await execute(
      config.visionPython,
      [
        resolve(ROOT, "vision/track.py"),
        "--video",
        videoPath,
        "--output",
        folder,
        "--weights",
        weights,
        "--video-hash",
        videoHash,
        "--weights-hash",
        lock.sha256,
        "--profile",
        profilePath,
        "--tracker",
        trackerPath,
        "--duration",
        String(info.duration),
      ],
      {
        timeout: 900_000,
        maxBuffer: 1_000_000,
        windowsHide: true,
        env: {
          ...process.env,
          YOLO_CONFIG_DIR: resolve(folder, "ultralytics-config"),
          ULTRALYTICS_AUTOINSTALL: "false",
          YOLO_OFFLINE: "true",
        },
      },
    );
    await writeFile(
      resolve(folder, "tracking-process.log"),
      logs.stdout + logs.stderr,
    );
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; killed?: boolean };
    await writeFile(
      resolve(folder, "tracking-process.log"),
      ((e.stdout ?? "") + (e.stderr ?? "")).slice(-100_000),
    );
    throw new AgentError(
      e.killed ? "TRACKING_TIMEOUT" : "TRACKING_FAILED",
      "真实人物追踪未完成；诊断已保留，本次没有继续调用解说模型。",
      500,
    );
  }
  const manifest = validateTrackingManifest(
    JSON.parse(
      await readFile(resolve(folder, "tracking-manifest.json"), "utf8"),
    ),
    videoHash,
    info.duration,
  );
  if (
    manifest.model.sha256 !== lock.sha256 ||
    manifest.model.name !== profile.modelName ||
    manifest.config_sha256 !== configHash ||
    manifest.dependencies?.tool_sha256 !== toolHash
  )
    invalid();
  const trackFile = resolve(folder, "tracks.jsonl");
  if (
    (await stat(trackFile)).size !== manifest.files.tracks.bytes ||
    (await fileHash(trackFile)) !== manifest.files.tracks.sha256
  )
    invalid();
  const exclusions = manifest.files.exclusions;
  if (
    exclusions &&
    (exclusions.name !== "excluded-detections.jsonl" ||
      !hashPattern.test(exclusions.sha256) ||
      !Number.isSafeInteger(exclusions.bytes) ||
      exclusions.bytes < 0 ||
      exclusions.bytes > 100_000_000 ||
      (await stat(resolve(folder, "excluded-detections.jsonl"))).size !==
        exclusions.bytes ||
      (await fileHash(resolve(folder, "excluded-detections.jsonl"))) !==
        exclusions.sha256)
  )
    invalid();
  const regions = manifest.files.floor_regions;
  if (
    regions &&
    (regions.name !== "floor-regions.jsonl" ||
      !hashPattern.test(regions.sha256) ||
      !Number.isSafeInteger(regions.bytes) ||
      regions.bytes < 0 ||
      regions.bytes > 100_000_000 ||
      (await stat(resolve(folder, "floor-regions.jsonl"))).size !==
        regions.bytes ||
      (await fileHash(resolve(folder, "floor-regions.jsonl"))) !==
        regions.sha256)
  )
    invalid();
  const observations: unknown[] = [];
  const reader = createInterface({
    input: createReadStream(trackFile),
    crlfDelay: Infinity,
  });
  for await (const row of reader) {
    if (row.length > 5000 || observations.length >= 150000) invalid();
    try {
      observations.push(JSON.parse(row));
    } catch {
      invalid();
    }
  }
  const rows = validateTrackingRows(observations, manifest);
  const timeline = compileTrackingOverlays(rows, manifest);
  const detections = manifest.files.detections;
  if (
    !detections ||
    !manifest.detection_cache ||
    (await stat(resolve(folder, "detections.jsonl"))).size !==
      detections.bytes ||
    (await fileHash(resolve(folder, "detections.jsonl"))) !== detections.sha256
  )
    invalid();
  if (manifest.appearance) {
    const aux = JSON.parse(
      await readFile(resolve(ROOT, "vision/aux-model-lock.json"), "utf8"),
    );
    if (manifest.appearance.sha256 !== aux.appearance.sha256) invalid();
  }
  await writeFile(
    resolve(folder, "track-index.json"),
    JSON.stringify(compileTrackIndex(timeline, manifest)),
  );
  await writeFile(
    resolve(folder, "overlay-timeline.json"),
    JSON.stringify(timeline),
  );
  await writeFile(
    resolve(folder, "identity-links.json"),
    JSON.stringify({
      schemaVersion: "courtside.identity-links.v1",
      videoSha256: videoHash,
      links: [],
      status: "unconfirmed",
    }),
  );
  await writeFile(
    resolve(folder, "event-track-links.json"),
    JSON.stringify({
      schemaVersion: "courtside.event-track-links.v1",
      videoSha256: videoHash,
      links: [],
      reason: "No confirmed identities; event cards remain independent.",
    }),
  );
  const base = `/api/jobs/${jobId}/artifacts/`;
  const artifact: TrackingArtifact = {
    status: "completed",
    source: "pretrained_inference",
    model: manifest.model.name,
    modelSha256: manifest.model.sha256,
    configSha256: configHash,
    processedFrames: manifest.stats.processed_frames,
    framesWithTracks: manifest.stats.frames_with_tracks,
    uniqueTracks: manifest.stats.unique_tracks,
    segmentCount: manifest.segments.length,
    identityStatus: "unconfirmed",
    manifest: base + "tracking-manifest.json",
    tracks: base + "tracks.jsonl",
    identityLinks: base + "identity-links.json",
    eventLinks: base + "event-track-links.json",
    overlays: base + "overlay-timeline.json",
    resources: manifest.resources,
    detections: base + "detections.jsonl",
    trackIndex: base + "track-index.json",
    detectionCache: manifest.detection_cache,
    ...(exclusions ? { exclusions: base + "excluded-detections.jsonl" } : {}),
    ...(regions ? { floorRegions: base + "floor-regions.jsonl" } : {}),
  };
  return { artifact, timeline, manifest };
}
