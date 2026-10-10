"""Local developer command to cache inference once for controlled association comparisons."""
import argparse
import json
import os
from pathlib import Path
import time
from detections import DetectionCache,detection_fingerprint,digest,measured_box_array

ROOT=Path(__file__).resolve().parents[1]


def run(args):
    config_dir=ROOT/".local/vision-cache/config";config_dir.mkdir(parents=True,exist_ok=True)
    os.environ.update(YOLO_CONFIG_DIR=str(config_dir),YOLO_OFFLINE="true",ULTRALYTICS_AUTOINSTALL="false")
    for name in ("OMP_NUM_THREADS","MKL_NUM_THREADS","OPENBLAS_NUM_THREADS"):os.environ[name]="2"
    import av,cv2,torch,ultralytics
    from ultralytics import YOLO,settings
    from core import normalize_display
    profile=json.loads((ROOT/"vision/profile.json").read_text(encoding="utf8"))
    lock=json.loads((ROOT/"vision/model-lock.json").read_text(encoding="utf8"))
    weights=ROOT/".local/vision-models"/lock["filename"]
    if digest(weights)!=lock["sha256"]:raise ValueError("Weights mismatch")
    source=Path(args.video).resolve(strict=True)
    settings.update({"sync":False});torch.set_num_threads(2);torch.set_num_interop_threads(2);cv2.setNumThreads(1)
    start=time.perf_counter()
    with av.open(str(source),options={"protocol_whitelist":"file,pipe"}) as container:
        stream=container.streams.video[0];stream.codec_context.thread_count=2
        duration=round(float(container.duration/av.time_base),2)
        fps=float(stream.average_rate or stream.guessed_rate);process_fps=min(fps,profile["maxFps"])
        versions={"ultralytics":ultralytics.__version__,"torch":torch.__version__,"pyav":av.__version__,"opencv":cv2.__version__}
        cache=DetectionCache(ROOT/".local/vision-cache",detection_fingerprint(digest(source),lock["sha256"],duration,profile,versions))
        model=None if cache.state=="hit" else YOLO(str(weights))
        if model:model.add_callback("on_predict_start",lambda _:torch.set_num_threads(2))
        origin=float(stream.start_time*stream.time_base) if stream.start_time is not None else None
        next_sample=0
        try:
            for index,frame in enumerate(container.decode(stream)):
                raw=float(frame.pts*frame.time_base)
                if origin is None:origin=raw
                stamp=raw-origin
                if stamp>=duration:break
                if stamp+1e-6<next_sample:continue
                next_sample=stamp+1/process_fps
                image=normalize_display(frame.to_ndarray(format="bgr24"),float(stream.sample_aspect_ratio or 1),int(frame.rotation))
                def predict():return measured_box_array(model.predict(image,classes=[0],device="cpu",imgsz=profile["imageSize"],conf=profile["confidence"],verbose=False,save=False,show=False)[0])
                cache.get(index,stamp,image.shape[1],image.shape[0],predict)
                if cache.frames%120==0:print(json.dumps({"frames":cache.frames,"pts":round(stamp,3)}),flush=True)
            result=cache.finish()
            print(json.dumps({**result,"video":source.name,"wall_seconds":round(time.perf_counter()-start,3)}),flush=True)
        finally:cache.close()


if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("video");run(parser.parse_args())
