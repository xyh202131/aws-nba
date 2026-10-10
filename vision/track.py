"""CPU-only, local-file YOLO11m/BoT-SORT inference. No AWS, training or runtime downloads."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import shutil
from types import SimpleNamespace

os.environ["ULTRALYTICS_AUTOINSTALL"] = "false"
os.environ["YOLO_OFFLINE"] = "true"
os.environ["MPLBACKEND"] = "Agg"


def digest(path):
    value = hashlib.sha256()
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def run(args):
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    (output / "ultralytics-config").mkdir(exist_ok=True)
    os.environ["YOLO_CONFIG_DIR"] = str(output / "ultralytics-config")
    profile_bytes = Path(args.profile).read_bytes()
    profile = json.loads(profile_bytes)
    tool_hash = hashlib.sha256(b"".join((Path(__file__).parent/name).read_bytes() for name in ("track.py","core.py","detections.py","appearance.py"))).hexdigest()
    for name in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
        os.environ[name] = str(profile["threads"])
    import av
    import cv2
    import numpy as np
    import psutil
    import torch
    import ultralytics
    import yaml
    from ultralytics import YOLO, settings
    from ultralytics.trackers.bot_sort import BOTSORT
    from ultralytics.engine.results import Boxes
    from detections import DetectionCache,detection_fingerprint,measured_box_array
    from core import normalize_display, scene_cut, include_person, floor_region, inside_floor

    source = Path(args.video).resolve(strict=True)
    weights = Path(args.weights).resolve(strict=True)
    if digest(source) != args.video_hash or digest(weights) != args.weights_hash:
        raise ValueError("Input or weights hash does not match the declared hash")
    if ultralytics.__version__ != "8.4.174":
        raise ValueError("Pinned ultralytics 8.4.174 is required")
    tracker_bytes = Path(args.tracker).read_bytes()
    settings.update({"sync": False})
    torch.set_num_threads(profile["threads"])
    torch.set_num_interop_threads(profile["threads"])
    cv2.setNumThreads(1)
    started, cpu_started = time.perf_counter(), time.process_time()
    peak_rss = psutil.Process().memory_info().rss
    container = av.open(str(source), options={
        "protocol_whitelist": "file,pipe",
        "format_whitelist": "mov,mp4,m4a,3gp,3g2,mj2,matroska,webm,avi,mpeg,mpegts,flv,asf,ogg",
    })
    stream = container.streams.video[0]
    stream.codec_context.thread_count = profile["threads"]
    source_fps = float(stream.average_rate or stream.guessed_rate or 0)
    if not 1 <= source_fps <= 240:
        raise ValueError("Video frame rate could not be verified")
    process_fps = min(source_fps, profile["maxFps"])
    versions={"ultralytics":ultralytics.__version__,"torch":torch.__version__,"pyav":av.__version__,"opencv":cv2.__version__}
    cache=DetectionCache(Path(__file__).resolve().parents[1]/".local/vision-cache",detection_fingerprint(args.video_hash,args.weights_hash,args.duration,profile,versions))
    model=None if cache.state=="hit" else YOLO(str(weights))
    if model:model.add_callback("on_predict_start",lambda _predictor:torch.set_num_threads(profile["threads"]))
    tracker_settings = yaml.safe_load(tracker_bytes)
    # In pinned Ultralytics 8.4.174, track_buffer counts tracker update frames.
    tracker_settings["track_buffer"] = max(1, round(profile["lostBufferSeconds"] * process_fps))
    runtime_tracker = output / "runtime-tracker.yaml"
    tracker = BOTSORT(SimpleNamespace(**tracker_settings))
    appearance=None
    if profile.get("appearance",False):
        from appearance import AppearanceEncoder, attach_encoder
        appearance=AppearanceEncoder(profile["threads"],profile.get("appearanceRefreshSeconds",.25))
        attach_encoder(tracker,appearance)
    runtime_tracker.write_text(yaml.safe_dump(vars(tracker.args)), encoding="utf8")
    origin = float(stream.start_time * stream.time_base) if stream.start_time is not None else None
    next_sample = 0.0
    previous, previous_time = None, -1.0
    segments = [{"id": "S001", "start": 0.0, "end": args.duration, "reason": "start"}]
    active = {}
    seen = set()
    processed = frames_with_tracks = included_count = excluded_count = count = 0
    width = height = rotation = 0
    sar = float(stream.sample_aspect_ratio or 1)
    observed_threads = 0
    peak_working_bytes = source.stat().st_size + weights.stat().st_size
    tracks = output / "tracks.jsonl"
    excluded_file = output / "excluded-detections.jsonl"
    regions_file = output / "floor-regions.jsonl"
    with tracks.open("w", encoding="utf8", newline="\n") as sink, excluded_file.open("w", encoding="utf8", newline="\n") as rejected, regions_file.open("w", encoding="utf8", newline="\n") as regions:
        for index, frame in enumerate(container.decode(stream)):
            if frame.pts is None:
                raise ValueError("Missing source presentation timestamp")
            raw_time = float(frame.pts * frame.time_base)
            if origin is None:
                origin = raw_time
            stamp = raw_time - origin
            if stamp < -1e-6 or stamp <= previous_time:
                raise ValueError("Nonmonotonic video PTS")
            previous_time = stamp
            if stamp >= args.duration:
                break
            if stamp + 1e-6 < next_sample:
                continue
            next_sample = stamp + 1 / process_fps
            rotation = int(frame.rotation)
            image = normalize_display(frame.to_ndarray(format="bgr24"), sar, rotation)
            if width and (image.shape[1] != width or image.shape[0] != height):
                raise ValueError("Display plane changes inside the video")
            height, width = image.shape[:2]
            if previous is not None and scene_cut(previous, image, profile["cutPixelThreshold"], profile["cutHistogramThreshold"]):
                tracker.reset()
                segments[-1]["end"] = stamp
                segments.append({"id": f"S{len(segments) + 1:03d}", "start": stamp, "end": args.duration, "reason": "scene_cut"})
                active.clear()
                if appearance:appearance.reset()
            previous = cv2.resize(image, (128, 72))
            def detect():
                return measured_box_array(model.predict(image,classes=[0],device="cpu",imgsz=profile["imageSize"],conf=profile["confidence"],verbose=False,save=False,show=False)[0])
            boxes=Boxes(torch.from_numpy(cache.get(index,stamp,width,height,detect)),image.shape[:2])
            observed_threads = max(observed_threads,torch.get_num_threads())
            if observed_threads > profile["threads"]:
                raise ValueError("Configured inference thread limit was not honored")
            common = {
                "schema_version": "courtside.player-track.v1", "video_sha256": args.video_hash,
                "coordinate_space": "source_video_pixels", "frame_width": width, "frame_height": height,
                "pts_seconds": round(stamp, 6), "frame_index": index, "segment_id": segments[-1]["id"],
                "source_frame_duration_seconds": round(float(frame.duration * frame.time_base) if frame.duration else 1 / source_fps, 6),
                "anchor_method": "bbox_bottom_center_approximation", "player_id": None,
                "identity_status": "unconfirmed", "identity_evidence": [], "court_xy_m": None,
                "calibration_id": None,
            }
            rows, present = [], {}
            polygon = floor_region(image, boxes.xyxy.cpu().numpy())
            regions.write(json.dumps({"pts_seconds":round(stamp,6), "frame_index":index,
                "segment_id":segments[-1]["id"], "method":profile["courtFilter"],
                "polygon_px":None if polygon is None else polygon[:,0,:].round(2).tolist()}, separators=(",",":")) + "\n")
            keep = []
            for detection_index, (box, score) in enumerate(zip(boxes.xyxy.cpu().numpy(), boxes.conf.cpu().numpy())):
                size_ok, reason = include_person(box, width, height, profile["minHeightRatio"])
                include = size_ok
                if size_ok:
                    include, reason = inside_floor(box, polygon, height * profile["floorBoundaryMarginRatio"])
                # Keep valid detector observations through a temporary floor-boundary miss.
                # The output gate below is unchanged; out-of-floor positions are never rendered.
                if include or (size_ok and profile.get("associationScope") == "size_qualified"):
                    keep.append(detection_index)
                if not include:
                    excluded_count += 1
                    rejected.write(json.dumps({"pts_seconds": round(stamp,6), "frame_index": index,
                        "bbox_xyxy_px": [round(float(v),4) for v in box], "detector_score": round(float(score),6),
                        "reason": reason, "role": "unknown", "floor_region_frame":index}, separators=(",",":")) + "\n")
            accepted_boxes = boxes[keep].cpu().numpy()
            if appearance:appearance.stamp=stamp
            tracked = tracker.update(accepted_boxes, image)
            if len(tracked):
                for observation in tracked:
                    # The tracker assigns identity; positions remain the actual detector measurement.
                    box = accepted_boxes.xyxy[int(observation[-1])]
                    ident, score = observation[4], observation[5]
                    coords = [round(float(v), 4) for v in box]
                    include, reason = include_person(coords, width, height, profile["minHeightRatio"])
                    if include:
                        include, reason = inside_floor(coords,polygon,height * profile["floorBoundaryMarginRatio"])
                    track_id = f"T{int(ident):03d}"
                    present[track_id] = include
                    rows.append({**common, "track_id": track_id, "bbox_xyxy_px": coords,
                        "anchor_px": [round((coords[0] + coords[2]) / 2, 4), coords[3]],
                        "status": "detected", "detector_score": round(float(score), 6),
                        "included": include, "exclusion_reason": reason})
                    if include:
                        included_count += 1
                        seen.add((segments[-1]["id"], track_id))
            for ident in active.keys() - present.keys():
                rows.append({**common, "track_id": ident, "bbox_xyxy_px": None, "anchor_px": None,
                    "status": "lost", "detector_score": None, "included": False, "exclusion_reason": "not_observed"})
            active = present
            for row in sorted(rows, key=lambda r: r["track_id"]):
                sink.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
            count += len(rows)
            if count > profile["maxObservations"] or excluded_count > profile["maxObservations"] or sink.tell() + rejected.tell() + regions.tell() > 100_000_000:
                raise ValueError("Tracking observation limit exceeded")
            processed += 1
            frames_with_tracks += int(any(present.values()))
            peak_rss = max(peak_rss, psutil.Process().memory_info().rss)
            peak_working_bytes = max(peak_working_bytes,source.stat().st_size+weights.stat().st_size+sink.tell()+rejected.tell()+regions.tell())
            if processed % 120 == 0:
                print(f"TRACKING_PROGRESS frames={processed} pts={stamp:.2f}", flush=True)
    encoded_width, encoded_height = stream.codec_context.width, stream.codec_context.height
    container.close()
    cache_record=cache.finish();cache.close()
    shutil.copyfile(cache.path,output/"detections.jsonl")
    peak_working_bytes=max(peak_working_bytes,source.stat().st_size+weights.stat().st_size+(appearance.lock["bytes"] if appearance else 0)+cache_record["bytes"]+(output/"detections.jsonl").stat().st_size+tracks.stat().st_size+excluded_file.stat().st_size+regions_file.stat().st_size)
    if included_count == 0:
        raise ValueError("No qualifying person tracks were observed")
    if appearance and not appearance.inferred_crops:
        raise ValueError("Appearance association requested but no embeddings were inferred")
    manifest = {
        "schema_version": "courtside.tracking-manifest.v1", "source": "pretrained_inference",
        "video_sha256": args.video_hash, "width": width, "height": height, "duration": args.duration,
        "source_fps": source_fps, "processing_fps": process_fps, "time_origin_seconds": origin,
        "transform": {"rotation": rotation, "sar": sar, "encoded_width": encoded_width, "encoded_height": encoded_height},
        "model": {"name": profile["modelName"], "sha256": args.weights_hash, "license": profile["license"]},
        "config_sha256": hashlib.sha256(profile_bytes + tracker_bytes).hexdigest(),
        "dependencies": {"python": sys.version.split()[0], "ultralytics": ultralytics.__version__, "torch": torch.__version__, "opencv": cv2.__version__, "numpy": np.__version__, "pyav": av.__version__, "tool_sha256":tool_hash, "inference_threads":str(observed_threads)},
        "render_policy": {"trail_seconds":profile["trailSeconds"],"position_source":"detector_measurement","interpolation":False},
        "tracker": {"name": "BoT-SORT", "gmc_method": "sparseOptFlow", "reid":bool(appearance), "buffer_seconds": profile["lostBufferSeconds"],"fuse_score":tracker_settings["fuse_score"],"association_scope":profile.get("associationScope","floor_qualified")},
        "detection_cache":cache_record,
        "appearance":None if not appearance else {"name":"YOLO26n-ReID","sha256":appearance.lock["sha256"],"refresh_seconds":appearance.refresh_seconds,"inferred_crops":appearance.inferred_crops,"reused_crops":appearance.reused_crops,"provider":"CPUExecutionProvider"},
        "segments": segments,
        "stats": {"processed_frames": processed, "frames_with_tracks": frames_with_tracks, "observations": count, "included_observations": included_count, "unique_tracks": len(seen), "excluded_observations": excluded_count},
        "resources": {"wall_seconds": round(time.perf_counter() - started, 3), "cpu_seconds": round(time.process_time() - cpu_started, 3), "peak_rss_bytes": peak_rss, "output_bytes": tracks.stat().st_size+excluded_file.stat().st_size+regions_file.stat().st_size+(output/"detections.jsonl").stat().st_size, "peak_working_bytes":peak_working_bytes},
        "files": {"tracks": {"name": "tracks.jsonl", "sha256": digest(tracks), "bytes": tracks.stat().st_size}, "exclusions": {"name":"excluded-detections.jsonl", "sha256":digest(excluded_file), "bytes":excluded_file.stat().st_size}, "floor_regions": {"name":"floor-regions.jsonl", "sha256":digest(regions_file), "bytes":regions_file.stat().st_size},"detections":{"name":"detections.jsonl","sha256":digest(output/"detections.jsonl"),"bytes":(output/"detections.jsonl").stat().st_size}},
    }
    (output / "tracking-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf8")
    print(json.dumps({"status": "completed", "processedFrames": processed, "uniqueTracks": len(seen)}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for name in ("video", "output", "weights", "video-hash", "weights-hash", "profile", "tracker"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--duration", required=True, type=float)
    arguments = parser.parse_args()
    try:
        run(arguments)
    except Exception as failure:
        # Diagnostics remain private; no silent fallback, retries or model calls.
        folder = Path(arguments.output)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "tracking-error.json").write_text(json.dumps({"type": type(failure).__name__, "message": str(failure)[:1000]}), encoding="utf8")
        print("TRACKING_FAILED " + type(failure).__name__, file=sys.stderr)
        sys.exit(1)
