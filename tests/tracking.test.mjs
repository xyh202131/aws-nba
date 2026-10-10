import test from "node:test";
import assert from "node:assert/strict";
import { parseRequest } from "../agent/contracts.ts";
import { buildAss, videoRenderSettings } from "../agent/render.ts";
import {
  validateTrackingRows,
  validateTrackingManifest,
} from "../agent/tracking.ts";
import {
  compileTrackingOverlays,
  compileTrackIndex,
} from "../shared/tracking.ts";
import { validateReusedFrames } from "../agent/pipeline.ts";
import { JobManager } from "../agent/jobs.ts";
import { loadConfig } from "../agent/config.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

test("v2 film requests can require tracking without changing v1 parsing", () => {
  const request = {
    schemaVersion: "courtside.agent.request.v2",
    clipId: "train_002",
    outputMode: "film",
    executionMode: "fixture",
    trackingMode: "required",
  };
  assert.deepEqual(parseRequest(request), request);
  assert.throws(() =>
    parseRequest({ ...request, schemaVersion: "courtside.agent.request.v1" }),
  );
  assert.throws(() => parseRequest({ ...request, outputMode: "analysis" }));
  assert.throws(() => parseRequest({ ...request, trackingMode: "optional" }));
  assert.throws(() => parseRequest({ ...request, pythonPath: "injected.py" }));
  assert.throws(() =>
    parseRequest({ ...request, reuseNarrationJobId: "../../secret" }),
  );
  assert.throws(() =>
    parseRequest({
      ...request,
      trackingMode: "none",
      reuseNarrationJobId: "00000000-0000-0000-0000-000000000000",
    }),
  );
});

test("a narration source mismatch fails before tracking or paid analysis", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "courtside-tracking-test-"));
  t.after(async () => {
    assert.ok(
      resolve(directory).startsWith(
        resolve(tmpdir()) + sep + "courtside-tracking-test-",
      ),
    );
    await rm(directory, { recursive: true, force: true });
  });
  const manager = new JobManager(
    loadConfig({
      AGENT_DATA_DIR: directory,
      AGENT_PROVIDER: "bedrock",
      ALLOW_PAID_MODEL_CALLS: "true",
    }),
  );
  await manager.initialize();
  const job = await manager.create(
    parseRequest({
      schemaVersion: "courtside.agent.request.v2",
      clipId: "train_002",
      outputMode: "film",
      trackingMode: "required",
      reuseNarrationJobId: "00000000-0000-0000-0000-000000000000",
    }),
  );
  await manager.settled();
  assert.equal(job.status, "failed");
  assert.equal(job.error.code, "NARRATION_REUSE_MISMATCH");
  assert.equal(job.stages.find((s) => s.id === "tracking").status, "pending");
  assert.equal(job.invocation, undefined);
});

const hash = "a".repeat(64);
test("generic role evidence is annotation-free, bounded and incompatible with video whitelists", () => {
  const m = manifest();
  m.role_filter = {
    source: "pretrained_semantic_roles", name: "CLIP-ViT-B-32", sha256: hash,
    license: "MIT", prompts_sha256: hash, crop_transform: "full_box_gray_pad224_v1",
    annotations_used: false, identity_status: "unconfirmed",
    score_kind: "uncalibrated_cosine_similarity", margin: .02,
    negative_samples: 2, refresh_seconds: .33, ttl_seconds: .6,
    inferred_crops: 3, suppressed_observations: 1, restored_observations: 0,
    uncertain_policy: "preserve_floor_gate", shorts_required: false,
  };
  m.files.role_evidence = { name: "person-role-evidence.jsonl", sha256: hash, bytes: 100 };
  assert.doesNotThrow(() => validateTrackingManifest(m, hash, 1));
  for (const changes of [
    { annotations_used: true }, { shorts_required: true }, { negative_samples: 1 },
    { suppressed_observations: 4 }, { sha256: "invalid" }, { margin: NaN },
    { inferred_crops: 150001 }, { identity_status: "confirmed" },
  ]) {
    assert.throws(() => validateTrackingManifest({ ...m, role_filter: { ...m.role_filter, ...changes } }, hash, 1));
  }
  assert.throws(() => validateTrackingManifest({ ...m, player_scope: {} }, hash, 1));
  assert.throws(() => validateTrackingManifest({ ...m, files: { ...m.files, role_evidence: { name: "../../secret", sha256: hash, bytes: 100 } } }, hash, 1));
  assert.throws(() => validateTrackingManifest({ ...m, role_filter: null }, hash, 1));
});
test("narration reuse preserves actual frame bytes and timestamps", () => {
  const frame = {
    id: "clip:frame:0",
    requestedTime: 1,
    time: 1.01,
    sha256: hash,
    image: "old-url",
  };
  assert.doesNotThrow(() =>
    validateReusedFrames([frame], [{ ...frame, image: "new-url" }]),
  );
  for (const changed of [
    { ...frame, sha256: "b".repeat(64) },
    { ...frame, time: 1.04 },
    { ...frame, id: "other-frame" },
  ])
    assert.throws(() => validateReusedFrames([frame], [changed]));
});
function manifest(observations = 3) {
  return {
    schema_version: "courtside.tracking-manifest.v1",
    source: "pretrained_inference",
    video_sha256: hash,
    width: 1280,
    height: 720,
    duration: 1,
    source_fps: 25,
    processing_fps: 25,
    time_origin_seconds: 0,
    transform: {
      rotation: 0,
      sar: 1,
      encoded_width: 1280,
      encoded_height: 720,
    },
    model: { name: "YOLO11m", sha256: hash, license: "AGPL-3.0" },
    config_sha256: hash,
    dependencies: {},
    tracker: {
      name: "BoT-SORT",
      gmc_method: "sparseOptFlow",
      reid: false,
      buffer_seconds: 0.5,
    },
    segments: [
      { id: "S001", start: 0, end: 0.5, reason: "start" },
      { id: "S002", start: 0.5, end: 1, reason: "scene_cut" },
    ],
    stats: {
      observations,
      included_observations: observations,
      processed_frames: 3,
      frames_with_tracks: Math.min(3, observations),
      unique_tracks: Math.min(2, observations),
      excluded_observations: 0,
    },
    resources: {
      wall_seconds: 1,
      cpu_seconds: 1,
      peak_rss_bytes: 1,
      output_bytes: 1,
    },
    files: { tracks: { name: "tracks.jsonl", sha256: hash, bytes: 1 } },
  };
}
function observation(time = 0.48, segment = "S001") {
  return {
    schema_version: "courtside.player-track.v1",
    video_sha256: hash,
    coordinate_space: "source_video_pixels",
    frame_width: 1280,
    frame_height: 720,
    pts_seconds: time,
    frame_index: Math.round(time * 25),
    segment_id: segment,
    track_id: "T007",
    bbox_xyxy_px: [100, 100, 180, 300],
    anchor_px: [140, 300],
    anchor_method: "bbox_bottom_center_approximation",
    status: "detected",
    detector_score: 0.9,
    included: true,
    exclusion_reason: null,
    player_id: null,
    identity_status: "unconfirmed",
    identity_evidence: [],
    court_xy_m: null,
    calibration_id: null,
  };
}

test("tracking rejects swapped videos, malformed boxes, invented identities and off-segment timestamps", () => {
  const m = manifest(1);
  assert.equal(validateTrackingManifest(m, hash, 1), m);
  assert.throws(() => validateTrackingManifest(m, "b".repeat(64), 1));
  for (const bad of [
    { ...m, time_origin_seconds: NaN },
    { ...m, stats: { ...m.stats, frames_with_tracks: 100 } },
    { ...m, transform: { ...m.transform, rotation: 13 } },
    { ...m, transform: { ...m.transform, sar: 2 } },
  ])
    assert.throws(() => validateTrackingManifest(bad, hash, 1));
  for (const bad of [
    { ...observation(), frame_index: -1 },
    { ...observation(), bbox_xyxy_px: [100, 100, 1400, 300] },
    { ...observation(), player_id: "made-up" },
    { ...observation(), pts_seconds: 0.6 },
    { ...observation(), status: "predicted" },
    { ...observation(), anchor_px: [1, 1] },
  ])
    assert.throws(() => validateTrackingRows([bad], m));
  assert.equal(validateTrackingRows([observation()], m).length, 1);
});

test("ByteTrack manifests declare no camera compensation and cannot claim ReID", () => {
  const m = manifest(1);
  const value = {
    ...m,
    tracker: { ...m.tracker, name: "ByteTrack", gmc_method: null },
  };
  assert.doesNotThrow(() => validateTrackingManifest(value, hash, 1));
  assert.throws(() =>
    validateTrackingManifest(
      { ...value, tracker: { ...value.tracker, gmc_method: "sparseOptFlow" } },
      hash,
      1,
    ),
  );
  assert.throws(() =>
    validateTrackingManifest(
      { ...value, tracker: { ...value.tracker, reid: true } },
      hash,
      1,
    ),
  );
});

test("coarse player references never become confirmed NBA identities or reviewed truth", () => {
  const scope = {
    source: "user_provided_coarse_player_boxes",
    review_status: "provisional",
    annotations_sha256: hash,
    reference_frames: 30,
    reference_boxes: 200,
    matched_reference_frames: 30,
    seed_tracks: 20,
    suppressed_observations: 0,
    shorts_policy: "positive_cue_not_required_3_observations_100ms",
    unreferenced_policy: "hide_without_strong_shorts_and_court_evidence",
    identity_status: "unconfirmed",
  };
  const m = { ...manifest(1), player_scope: scope };
  assert.doesNotThrow(() => validateTrackingManifest(m, hash, 1));
  for (const bad of [
    { ...scope, review_status: "confirmed" },
    { ...scope, identity_status: "confirmed" },
    { ...scope, annotations_sha256: "invalid" },
    { ...scope, suppressed_observations: 2 },
    { ...scope, reference_policy: "label_entire_track" },
    { ...scope, leg_policy: "skin_color_only" },
  ])
    assert.throws(() =>
      validateTrackingManifest({ ...m, player_scope: bad }, hash, 1),
    );
});

test("native HD uses verified display dimensions and preserves the 16:9 ASS coordinate mapping", () => {
  const info = { width: 1920, height: 1080, duration: 5, hasAudio: true };
  const timeline = { sourceWidth: 1920, sourceHeight: 1080, frames: [] };
  const native = videoRenderSettings(info, timeline, "source");
  assert.equal(native.width, 1920);
  assert.equal(native.height, 1080);
  assert.match(native.filter, /scale=1920:1080/);
  assert.equal(videoRenderSettings(info, timeline, "720p").width, 1280);
  assert.equal(
    videoRenderSettings(
      info,
      { ...timeline, sourceWidth: 640, sourceHeight: 360 },
      "source",
    ).width,
    640,
  );
  // No verified SAR/rotation plane means no native-HD assertion.
  assert.equal(videoRenderSettings(info, undefined, "source").width, 1280);
});

test("cache provenance and requested appearance inference cannot be silently fabricated", () => {
  const m = manifest(1);
  const cache = {
    state: "hit",
    key: hash,
    sha256: hash,
    bytes: 10,
    frames: 3,
    detections: 20,
  };
  const value = {
    ...m,
    detection_cache: cache,
    files: {
      ...m.files,
      detections: { name: "detections.jsonl", sha256: hash, bytes: 10 },
    },
  };
  assert.doesNotThrow(() => validateTrackingManifest(value, hash, 1));
  for (const changed of [
    { ...value, detection_cache: { ...cache, frames: 2 } },
    { ...value, detection_cache: { ...cache, sha256: "b".repeat(64) } },
    { ...value, tracker: { ...value.tracker, reid: true } },
    {
      ...value,
      tracker: { ...value.tracker, reid: true },
      appearance: {
        name: "YOLO26n-ReID",
        sha256: hash,
        refresh_seconds: 0.25,
        inferred_crops: 0,
        reused_crops: 0,
        provider: "CPUExecutionProvider",
      },
    },
  ])
    assert.throws(() => validateTrackingManifest(changed, hash, 1));
});

test("short image trails stop at a cut, loss or long detection gap", () => {
  const m = manifest();
  const rows = [
    observation(0.44),
    observation(0.48),
    observation(0.52, "S002"),
  ];
  const timeline = compileTrackingOverlays(validateTrackingRows(rows, m), m);
  assert.equal(timeline.frames[0].trail.length, 1);
  assert.equal(timeline.frames[1].trail.length, 2);
  assert.equal(timeline.frames[1].end, 0.5);
  assert.equal(timeline.frames[2].trail.length, 1);
  const gap = compileTrackingOverlays([observation(0.1), observation(0.4)], m);
  assert.equal(gap.frames[1].trail.length, 1);
  assert.ok(
    gap.frames[0].end < gap.frames[1].start,
    "missing observations stay missing",
  );
});

test("VFR observations use decoded frame duration and do not extend through a gap", () => {
  const timeline = compileTrackingOverlays(
    [
      { ...observation(0.1), source_frame_duration_seconds: 0.01 },
      { ...observation(0.3), source_frame_duration_seconds: 0.08 },
    ],
    manifest(2),
  );
  assert.ok(Math.abs(timeline.frames[0].end - 0.11) < 1e-6);
  assert.ok(Math.abs(timeline.frames[1].end - 0.38) < 1e-6);
});

test("person retrieval indexes observed anonymous IDs without bridging loss or cuts", () => {
  const m = manifest(4);
  const rows = [
    observation(0.1),
    observation(0.4),
    { ...observation(0.44), included: false },
    observation(0.52, "S002"),
  ];
  const index = compileTrackIndex(compileTrackingOverlays(rows, m), m);
  assert.equal(index.identityStatus, "unconfirmed");
  assert.equal(
    index.tracks.length,
    2,
    "same ID after a cut is a separate search result",
  );
  const first = index.tracks.find((t) => t.segmentId === "S001");
  assert.equal(
    first.observations,
    2,
    "excluded observations are not searchable positions",
  );
  assert.equal(first.gapCount, 1);
  assert.ok(
    Math.abs(first.visibleSeconds - 0.08) < 1e-6,
    "the missing 0.26s is not counted as observed",
  );
  assert.equal(first.sampleTime, 0.1);
  assert.equal(index.tracksSha256, m.files.tracks.sha256);
});

test("required tracking failure stops a paid-config pipeline before any invocation", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "courtside-tracking-test-"));
  t.after(async () => {
    assert.ok(
      resolve(directory).startsWith(
        resolve(tmpdir()) + sep + "courtside-tracking-test-",
      ),
    );
    await rm(directory, { recursive: true, force: true });
  });
  const config = loadConfig({
    AGENT_DATA_DIR: directory,
    AGENT_PROVIDER: "bedrock",
    ALLOW_PAID_MODEL_CALLS: "true",
    VISION_PYTHON: join(directory, "missing-python.exe"),
  });
  const manager = new JobManager(config);
  await manager.initialize();
  const job = await manager.create(
    parseRequest({
      schemaVersion: "courtside.agent.request.v2",
      clipId: "train_002",
      outputMode: "film",
      executionMode: "bedrock",
      trackingMode: "required",
    }),
  );
  await manager.settled();
  assert.equal(job.status, "failed");
  assert.equal(job.error.code, "TRACKING_UNAVAILABLE");
  assert.equal(job.stages.find((s) => s.id === "tracking").status, "failed");
  assert.equal(job.stages.find((s) => s.id === "analysis").status, "pending");
  assert.equal(job.invocation, undefined);
});

test("encoded anonymous overlays use canvas coordinates and never attach an unconfirmed xFG", () => {
  const data = {
    schemaVersion: "courtside.match-data.v1",
    source: "uploaded",
    events: [],
    warnings: [],
  };
  const timeline = {
    schemaVersion: "courtside.overlay-timeline.v1",
    sourceWidth: 1920,
    sourceHeight: 1080,
    frames: [
      {
        start: 0,
        end: 0.04,
        segmentId: "S001",
        trackId: "T007",
        bbox: [100, 100, 200, 300],
        anchor: [150, 300],
        trail: [],
        source: "detected",
        observationRefs: [1],
        label: "T007",
      },
    ],
  };
  const ass = buildAss([], data, 1, timeline);
  assert.ok(ass.includes("T007"), "real tracking ID is burned into the video");
  assert.ok(
    ass.includes("66.67"),
    "source pixels are scaled to the 1280px canvas",
  );
  assert.ok(
    !ass.includes("预期命中率"),
    "anonymous tracks carry no personal data",
  );
});
