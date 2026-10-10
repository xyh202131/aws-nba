"""Export the pinned local YOLO11m to a private FP32 ONNX candidate, never train/download."""
import json
import argparse
import os
from pathlib import Path
import time
import shutil
import uuid
from detections import digest

ROOT=Path(__file__).resolve().parents[1]


def isolated_export(source,destination,shape):
    from ultralytics import YOLO
    # Ultralytics derives its path from the underlying model.pt_path, not ckpt_path.
    # Give it a unique copy so even an exporter path change cannot overwrite other candidates.
    folder=source.parent/"exports"/str(uuid.uuid4());folder.mkdir(parents=True)
    copy=folder/source.name;shutil.copyfile(source,copy)
    exported=Path(YOLO(str(copy)).export(format="onnx",imgsz=shape,batch=1,device="cpu",opset=17,dynamic=False,simplify=False,nms=False,half=False))
    if exported.resolve().parent!=folder.resolve() or destination.exists():raise ValueError("Export path is outside the isolated directory or destination exists")
    exported.replace(destination)
    return destination


def main(width=960):
    os.environ["ULTRALYTICS_AUTOINSTALL"]="false";os.environ["YOLO_OFFLINE"]="true"
    import torch
    import ultralytics
    import onnx
    from ultralytics import YOLO,settings
    if ultralytics.__version__!="8.4.174":raise ValueError("Pinned Ultralytics required")
    lock=json.loads((ROOT/"vision/model-lock.json").read_text(encoding="utf8"))
    source=ROOT/".local/vision-models"/lock["filename"]
    if digest(source)!=lock["sha256"]:raise ValueError("Source weights hash mismatch")
    shape=(544,960) if width==960 else (384,640)
    destination=source.with_suffix(".onnx") if width==960 else source.with_name("yolo11m-640x384.onnx")
    record=destination.with_suffix(".onnx.json")
    if destination.exists() or record.exists():raise ValueError("Export exists; preserve it and verify its lock rather than overwrite")
    settings.update({"sync":False});torch.set_num_threads(2);torch.set_num_interop_threads(1)
    started=time.perf_counter()
    exported=isolated_export(source,destination,shape)
    onnx.checker.check_model(onnx.load(str(exported)))
    result={"schema_version":"courtside.onnx-export.v1","source_sha256":lock["sha256"],"sha256":digest(exported),
            "bytes":exported.stat().st_size,"input_shape":[1,3,*shape],"precision":"FP32","opset":17,"nms":False,
            "license":lock["license"],"dependencies":{"ultralytics":ultralytics.__version__,"torch":torch.__version__,"onnx":onnx.__version__},
            "export_wall_seconds":round(time.perf_counter()-started,3)}
    record.write_text(json.dumps(result,indent=2),encoding="utf8")
    print(json.dumps(result))


if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--width",type=int,choices=(640,960),default=960)
    main(parser.parse_args().width)
