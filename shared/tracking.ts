export type TrackObservation = {
  schema_version: "courtside.player-track.v1";
  video_sha256: string;
  coordinate_space: "source_video_pixels";
  frame_width: number;
  frame_height: number;
  pts_seconds: number;
  source_frame_duration_seconds?: number;
  frame_index: number;
  segment_id: string;
  track_id: string;
  bbox_xyxy_px: [number, number, number, number] | null;
  anchor_px: [number, number] | null;
  anchor_method: "bbox_bottom_center_approximation";
  status: "detected" | "lost";
  detector_score: number | null;
  included: boolean;
  exclusion_reason: string | null;
  player_id: null;
  identity_status: "unconfirmed";
  identity_evidence: never[];
  court_xy_m: null;
  calibration_id: null;
};

export type TrackingManifest = {
  schema_version: "courtside.tracking-manifest.v1";
  source: "pretrained_inference";
  video_sha256: string;
  width: number;
  height: number;
  duration: number;
  source_fps: number;
  processing_fps: number;
  time_origin_seconds: number;
  transform: {
    rotation: number;
    sar: number;
    encoded_width: number;
    encoded_height: number;
  };
  model: { name: string; sha256: string; license: string };
  config_sha256: string;
  render_policy?: {
    trail_seconds: number;
    position_source: "detector_measurement";
    interpolation: false;
  };
  dependencies: Record<string, string>;
  tracker: {
    name: "BoT-SORT";
    gmc_method: "sparseOptFlow";
    reid: boolean;
    buffer_seconds: number;
    fuse_score?: boolean;
    association_scope?: "floor_qualified" | "size_qualified";
  };
  detection_cache?: {
    state: "hit" | "miss";
    key: string;
    sha256: string;
    bytes: number;
    frames: number;
    detections: number;
  };
  appearance?: {
    name: "YOLO26n-ReID";
    sha256: string;
    refresh_seconds: number;
    inferred_crops: number;
    reused_crops: number;
    provider: "CPUExecutionProvider";
  } | null;
  segments: {
    id: string;
    start: number;
    end: number;
    reason: "start" | "scene_cut";
  }[];
  stats: {
    processed_frames: number;
    frames_with_tracks: number;
    observations: number;
    included_observations: number;
    unique_tracks: number;
    excluded_observations: number;
  };
  resources: {
    wall_seconds: number;
    cpu_seconds: number;
    peak_rss_bytes: number;
    output_bytes: number;
    peak_working_bytes?: number;
  };
  files: {
    tracks: { name: "tracks.jsonl"; sha256: string; bytes: number };
    exclusions?: {
      name: "excluded-detections.jsonl";
      sha256: string;
      bytes: number;
    };
    floor_regions?: {
      name: "floor-regions.jsonl";
      sha256: string;
      bytes: number;
    };
    detections?: { name: "detections.jsonl"; sha256: string; bytes: number };
  };
};

export type OverlayFrame = {
  start: number;
  end: number;
  segmentId: string;
  trackId: string;
  bbox: [number, number, number, number];
  anchor: [number, number] | null;
  trail: [number, number][];
  source: "detected";
  observationRefs: number[];
  label: string;
};
export type OverlayTimeline = {
  schemaVersion: "courtside.overlay-timeline.v1";
  sourceWidth: number;
  sourceHeight: number;
  frames: OverlayFrame[];
};

export type TrackingArtifact = {
  status: "completed";
  source: "pretrained_inference";
  model: string;
  modelSha256: string;
  configSha256: string;
  processedFrames: number;
  framesWithTracks: number;
  uniqueTracks: number;
  segmentCount: number;
  identityStatus: "unconfirmed";
  manifest: string;
  tracks: string;
  identityLinks: string;
  eventLinks: string;
  overlays: string;
  exclusions?: string;
  floorRegions?: string;
  detections?: string;
  trackIndex?: string;
  detectionCache?: TrackingManifest["detection_cache"];
  resources: TrackingManifest["resources"];
};

export type TrackIndex = {
  schemaVersion: "courtside.track-index.v1";
  videoSha256: string;
  tracksSha256: string;
  identityStatus: "unconfirmed";
  omittedTracks: number;
  tracks: {
    segmentId: string;
    trackId: string;
    firstTime: number;
    lastTime: number;
    sampleTime: number;
    observations: number;
    visibleSeconds: number;
    gapCount: number;
  }[];
};

/** A small retrieval index, derived only from included measured overlay exposures. */
export function compileTrackIndex(
  timeline: OverlayTimeline,
  manifest: TrackingManifest,
): TrackIndex {
  const entries = new Map<
    string,
    TrackIndex["tracks"][number] & { sampleArea: number }
  >();
  for (const f of timeline.frames) {
    const key = `${f.segmentId}/${f.trackId}`;
    const area = (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]);
    const previous = entries.get(key);
    if (!previous)
      entries.set(key, {
        segmentId: f.segmentId,
        trackId: f.trackId,
        firstTime: f.start,
        lastTime: f.end,
        sampleTime: f.start,
        sampleArea: area,
        observations: 1,
        visibleSeconds: f.end - f.start,
        gapCount: 0,
      });
    else {
      previous.gapCount += Number(f.start - previous.lastTime > 0.002);
      previous.observations++;
      previous.visibleSeconds += f.end - f.start;
      previous.lastTime = f.end;
      if (area > previous.sampleArea) {
        previous.sampleArea = area;
        previous.sampleTime = f.start;
      }
    }
  }
  const sorted = [...entries.values()].sort(
    (a, b) =>
      b.observations - a.observations ||
      a.firstTime - b.firstTime ||
      a.trackId.localeCompare(b.trackId),
  );
  return {
    schemaVersion: "courtside.track-index.v1",
    videoSha256: manifest.video_sha256,
    tracksSha256: manifest.files.tracks.sha256,
    identityStatus: "unconfirmed",
    omittedTracks: Math.max(0, sorted.length - 2000),
    tracks: sorted
      .slice(0, 2000)
      .map(({ sampleArea: _, ...entry }) => ({
        ...entry,
        visibleSeconds: Number(entry.visibleSeconds.toFixed(6)),
      })),
  };
}

/** These are source-image annotations, never court coordinates or official identities. */
export function compileTrackingOverlays(
  rows: TrackObservation[],
  manifest: TrackingManifest,
): OverlayTimeline {
  const frames: OverlayFrame[] = [];
  const trails = new Map<
    string,
    { time: number; anchor: [number, number] }[]
  >();
  const step = 1 / manifest.processing_fps;
  const stamps = [...new Set(rows.map((row) => row.pts_seconds))];
  const nextStamp = new Map(
    stamps.map((stamp, i) => [stamp, stamps[i + 1] ?? manifest.duration]),
  );
  let activeSegment = "";
  rows.forEach((row, index) => {
    if (activeSegment !== row.segment_id) {
      trails.clear();
      activeSegment = row.segment_id;
    }
    const key = `${row.segment_id}/${row.track_id}`;
    if (
      row.status !== "detected" ||
      !row.included ||
      !row.bbox_xyxy_px ||
      !row.anchor_px
    ) {
      trails.delete(key);
      return;
    }
    const previous = trails.get(key) ?? [];
    const recent =
      previous.length && row.pts_seconds - previous.at(-1)!.time <= step * 1.6
        ? previous.filter(
            (p) =>
              row.pts_seconds - p.time <=
              (manifest.render_policy?.trail_seconds ?? 0.8),
          )
        : [];
    recent.push({ time: row.pts_seconds, anchor: row.anchor_px });
    trails.set(key, recent);
    const segment = manifest.segments.find((s) => s.id === row.segment_id)!;
    frames.push({
      start: row.pts_seconds,
      // No extrapolation or interpolation: one source-frame exposure only.
      end: Math.min(
        manifest.duration,
        segment.end,
        nextStamp.get(row.pts_seconds)!,
        row.pts_seconds +
          (row.source_frame_duration_seconds ?? 1 / manifest.source_fps),
      ),
      segmentId: row.segment_id,
      trackId: row.track_id,
      bbox: row.bbox_xyxy_px,
      anchor: row.anchor_px[1] >= manifest.height - 2 ? null : row.anchor_px,
      trail: recent.map((p) => p.anchor),
      source: "detected",
      observationRefs: [index + 1],
      label: row.track_id,
    });
  });
  return {
    schemaVersion: "courtside.overlay-timeline.v1",
    sourceWidth: manifest.width,
    sourceHeight: manifest.height,
    frames: frames.filter((f) => f.end > f.start),
  };
}
