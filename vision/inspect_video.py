"""Independently decode prepared outputs and compare measured PTS to the original."""
import argparse
import hashlib
import json
from pathlib import Path
import av
import cv2
from detections import digest
from core import normalize_display


def inspect(path, output, label, sample_time):
    stamps=[];rotation=None;sar=None
    with av.open(str(path),options={"protocol_whitelist":"file,pipe"}) as container:
        stream=container.streams.video[0];stream.codec_context.thread_count=2
        fps=float(stream.average_rate or stream.guessed_rate)
        origin=None;nearest=None;delta=float("inf");width=height=0
        for frame in container.decode(stream):
            if frame.pts is None:raise ValueError("Video PTS missing")
            raw=float(frame.pts*frame.time_base)
            if origin is None:origin=raw
            stamp=raw-origin
            if stamps and stamp<=stamps[-1]:raise ValueError("Nonmonotonic PTS")
            stamps.append(stamp)
            if abs(stamp-sample_time)<delta:
                delta=abs(stamp-sample_time);nearest=frame;actual_time=stamp
        if nearest is None:raise ValueError("No decoded video frames")
        sar=float(stream.sample_aspect_ratio or 1);rotation=int(nearest.rotation)
        image=normalize_display(nearest.to_ndarray(format="bgr24"),sar,rotation)
        height,width=image.shape[:2]
        cv2.imwrite(str(output/f"{label}.png"),image)
        return {"file":str(path),"sha256":digest(path),"width":width,"height":height,"fps":fps,
                "frames":len(stamps),"firstPts":stamps[0],"lastPts":stamps[-1],"sar":sar,"rotation":rotation,
                "ptsSha256":hashlib.sha256(json.dumps([round(p,6) for p in stamps],separators=(",",":")).encode()).hexdigest(),
                "sampleTime":actual_time,"sampleImage":f"{label}.png"},stamps


def run(args):
    folder=Path(args.folder).resolve(strict=True)
    prep=json.loads((folder/"preparation.json").read_text(encoding="utf8"))
    source=Path(prep["source"]["path"])
    if digest(source)!=prep["source"]["sha256"]:raise ValueError("Original hash changed")
    original,reference=inspect(source,folder,"source",args.time)
    records=[]
    for item in prep["outputs"]:
        path=Path(item["file"])
        if digest(path)!=item["sha256"]:raise ValueError("Prepared output hash changed")
        record,stamps=inspect(path,folder,item["name"],args.time)
        record["sameFrameCount"]=len(stamps)==len(reference)
        record["maxRelativePtsErrorSeconds"]=max(abs(a-b) for a,b in zip(stamps,reference)) if record["sameFrameCount"] else None
        record["sameDisplaySize"]=record["width"]==original["width"] and record["height"]==original["height"]
        record["temporalCheckPassed"]=record["sameFrameCount"] and record["sameDisplaySize"] and record["maxRelativePtsErrorSeconds"]<=.001
        records.append(record)
    report={"schemaVersion":"courtside.video-quality-check.v1","source":original,"outputs":records,
            "limitations":["Timestamp/resolution checks do not certify better visual detail.","Light filtering can erase texture or create halos; retain the original as default."]}
    (folder/"quality-check.json").write_text(json.dumps(report,indent=2),encoding="utf8")
    if not all(r["temporalCheckPassed"] for r in records):raise ValueError("Prepared video changed temporal correspondence")
    print(json.dumps(report,indent=2))


if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("folder");parser.add_argument("--time",type=float,default=18.78);run(parser.parse_args())
