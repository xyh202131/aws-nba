"""Serial CPU comparison on identical decoded frames, tensors and NMS. No human accuracy claims."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

ROOT=Path(__file__).resolve().parents[1]
os.environ["ULTRALYTICS_AUTOINSTALL"]="false";os.environ["YOLO_OFFLINE"]="true"
for name in ("OMP_NUM_THREADS","MKL_NUM_THREADS","OPENBLAS_NUM_THREADS","NUMEXPR_NUM_THREADS"):os.environ[name]="2"


def worker(args):
    import av
    import cv2
    import numpy as np
    import psutil
    import torch
    import ultralytics
    from core import normalize_display
    from detections import digest
    from detector import OnnxDetector,prepare_tensor,postprocess
    from ultralytics import YOLO,settings
    torch.set_num_threads(2);torch.set_num_interop_threads(1);cv2.setNumThreads(1);settings.update({"sync":False})
    if ultralytics.__version__!="8.4.174":raise ValueError("Pinned Ultralytics required")
    source=Path(args.video).resolve(strict=True);output=Path(args.output).resolve();output.mkdir(parents=True,exist_ok=False)
    lock=json.loads((ROOT/"vision/model-lock.json").read_text(encoding="utf8"));weights=ROOT/".local/vision-models"/lock["filename"]
    if digest(weights)!=lock["sha256"]:raise ValueError("Weights hash mismatch")
    shape=(544,960) if args.image_size==960 else (384,640)
    model_path=weights;started=time.perf_counter();cpu_start=time.process_time()
    if args.backend=="torch":
        model=YOLO(str(weights)).model.fuse(verbose=False).eval()
        def forward(tensor):
            with torch.inference_mode():
                result=model(torch.from_numpy(tensor))
                return (result[0] if isinstance(result,tuple) else result).cpu().numpy()
        backend_version=torch.__version__
    else:
        import onnxruntime as ort
        model_path=weights.with_suffix(".onnx") if args.image_size==960 else weights.with_name("yolo11m-640x384.onnx")
        export=json.loads(model_path.with_suffix(".onnx.json").read_text(encoding="utf8"))
        if export["source_sha256"]!=lock["sha256"] or digest(model_path)!=export["sha256"]:raise ValueError("ONNX export hash mismatch")
        model=OnnxDetector(model_path,list(shape),2);forward=model.forward;backend_version=ort.__version__
    load_wall=time.perf_counter()-started
    load_cpu=time.process_time()-cpu_start
    peak=psutil.Process().memory_info().rss;frames=[];raw_outputs=[];pre_times=[];infer_times=[];post_times=[];tensor_hashes=[]
    video_hash=digest(source)
    with av.open(str(source),options={"protocol_whitelist":"file,pipe"}) as container:
        stream=container.streams.video[0];stream.codec_context.thread_count=2
        origin=float(stream.start_time*stream.time_base) if stream.start_time is not None else None
        # Fixed uniformly spaced real frame requests; no use of detector output or human labels.
        duration=float(stream.duration*stream.time_base)
        targets=[duration*(i+.5)/args.count for i in range(args.count)]
        for index,frame in enumerate(container.decode(stream)):
            if frame.pts is None:raise ValueError("Missing PTS")
            raw_time=float(frame.pts*frame.time_base)
            if origin is None:origin=raw_time
            stamp=raw_time-origin
            if len(frames)==args.count:break
            if stamp<targets[len(frames)]:continue
            image=normalize_display(frame.to_ndarray(format="bgr24"),float(stream.sample_aspect_ratio or 1),int(frame.rotation))
            t=time.perf_counter();tensor=prepare_tensor(image,shape);pre_times.append(time.perf_counter()-t)
            import hashlib
            tensor_hashes.append(hashlib.sha256(tensor.tobytes()).hexdigest())
            t=time.perf_counter();raw=forward(tensor);infer_times.append(time.perf_counter()-t)
            t=time.perf_counter();boxes=postprocess(raw,shape,image.shape[:2]);post_times.append(time.perf_counter()-t)
            raw_outputs.append(raw)
            frames.append({"frame_index":index,"pts_seconds":stamp,"width":image.shape[1],"height":image.shape[0],"boxes":boxes.tolist()})
            peak=max(peak,psutil.Process().memory_info().rss)
    if len(frames)!=args.count:raise ValueError("Insufficient benchmark frames")
    np.savez_compressed(output/"raw.npz",raw=np.stack(raw_outputs))
    record={"schema_version":"courtside.cpu-backend-benchmark.v1","backend":args.backend,"backend_version":backend_version,
            "video_sha256":video_hash,"model_sha256":digest(model_path),"source_weights_sha256":lock["sha256"],
            "input_shape":[1,3,*shape],"threads":{"intra_op":2,"inter_op":1},"tensor_sha256":tensor_hashes,"frames":frames,
            "quality_status":"not_evaluated_no_human_ground_truth",
            "timings":{"load_wall_seconds":load_wall,"load_cpu_seconds":load_cpu,"first_inference_seconds":infer_times[0],
                       "warm_inference_median_seconds":float(np.median(infer_times[1:])),"warm_inference_p95_seconds":float(np.percentile(infer_times[1:],95)),
                       "preprocess_seconds":sum(pre_times),"inference_seconds":sum(infer_times),"postprocess_seconds":sum(post_times),
                       "total_wall_seconds":time.perf_counter()-started,"total_cpu_seconds":time.process_time()-cpu_start},
            "peak_rss_bytes":peak,"raw_sha256":digest(output/"raw.npz"),"disk_bytes":(output/"raw.npz").stat().st_size}
    (output/"result.json").write_text(json.dumps(record,indent=2),encoding="utf8")
    print(json.dumps({"backend":args.backend,"timings":record["timings"],"peak_rss_bytes":peak}),flush=True)


def compare(directory):
    import numpy as np
    from scipy.optimize import linear_sum_assignment
    from quality import iou
    records=[json.loads((directory/b/"result.json").read_text(encoding="utf8")) for b in ("torch","onnx")]
    a,b=records
    if a["video_sha256"]!=b["video_sha256"] or a["tensor_sha256"]!=b["tensor_sha256"] or a["input_shape"]!=b["input_shape"]:
        raise ValueError("Benchmarks do not share exact frames, tensors or padding")
    with np.load(directory/"torch/raw.npz") as torch_raw,np.load(directory/"onnx/raw.npz") as onnx_raw:
        raw_error=float(np.max(np.abs(torch_raw["raw"]-onnx_raw["raw"])))
    frame_reports=[];all_ious=[];scores=[]
    for x,y in zip(a["frames"],b["frames"]):
        if x["frame_index"]!=y["frame_index"] or x["pts_seconds"]!=y["pts_seconds"]:raise ValueError("Frame mapping differs")
        left,right=x["boxes"],y["boxes"]
        matrix=np.array([[iou(p[:4],q[:4]) for q in right] for p in left]).reshape((len(left),len(right)))
        pairs=list(zip(*linear_sum_assignment(1-matrix))) if left and right else []
        matched=[(i,j) for i,j in pairs if matrix[i,j]>=.99]
        all_ious.extend(float(matrix[i,j]) for i,j in matched);scores.extend(abs(left[i][4]-right[j][4]) for i,j in matched)
        frame_reports.append({"frame_index":x["frame_index"],"torch_boxes":len(left),"onnx_boxes":len(right),"matched_iou_99":len(matched),
                              "unmatched_torch":len(left)-len(matched),"unmatched_onnx":len(right)-len(matched)})
    result={"schema_version":"courtside.cpu-backend-comparison.v1","video_sha256":a["video_sha256"],"sample_frames":len(frame_reports),
            "quality_status":a["quality_status"],"raw_max_absolute_error":raw_error,"post_nms_min_matched_iou":min(all_ious) if all_ious else None,
            "post_nms_max_matched_score_delta":max(scores) if scores else None,"frames":frame_reports,
            "warm_median_speedup":a["timings"]["warm_inference_median_seconds"]/b["timings"]["warm_inference_median_seconds"],
            "backends":[{k:r[k] for k in ("backend","backend_version","input_shape","model_sha256","timings","peak_rss_bytes","disk_bytes")} for r in records],
            "limitations":["Sampled numeric equivalence and speed do not measure human accuracy, IDF1 or HOTA.","Serial processes on a shared Windows host; not a cloud capacity or latency guarantee.","Detector-only benchmark; tracking, rendering and model service latency excluded from inference timings."]}
    (directory/"comparison.json").write_text(json.dumps(result,indent=2),encoding="utf8")
    print(json.dumps({"comparison":str(directory/"comparison.json"),"speedup":result["warm_median_speedup"],"raw_max_error":raw_error}),flush=True)


if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--video",required=True);parser.add_argument("--count",type=int,default=24)
    parser.add_argument("--output",default=str(ROOT/".local/backend-benchmarks"));parser.add_argument("--backend",choices=("torch","onnx"))
    parser.add_argument("--image-size",type=int,choices=(640,960),default=960)
    args=parser.parse_args()
    if not 4<=args.count<=60:parser.error("count must be 4..60")
    if args.backend:worker(args)
    else:
        directory=Path(args.output).resolve()/str(uuid.uuid4());directory.mkdir(parents=True)
        for backend in ("torch","onnx"):
            result=subprocess.run([sys.executable,__file__,"--backend",backend,"--video",args.video,"--count",str(args.count),"--image-size",str(args.image_size),"--output",str(directory/backend)],capture_output=True,text=True,timeout=600)
            (directory/(backend+".log")).write_text(result.stdout+result.stderr,encoding="utf8")
            if result.returncode:raise RuntimeError(f"{backend} benchmark failed; inspect {directory}")
            print(result.stdout.strip(),flush=True)
        compare(directory)
