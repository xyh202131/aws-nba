"""Diagnose user-provided provisional boxes without promoting them to confirmed truth."""
import argparse
import json
import math
from pathlib import Path
import numpy as np
from scipy.optimize import linear_sum_assignment
from detections import digest
from quality import iou


def matches(reference,prediction):
    matrix=np.array([[iou(a,b) for b in prediction] for a in reference],dtype=float).reshape(len(reference),len(prediction))
    pairs=list(zip(*linear_sum_assignment(1-matrix))) if reference and prediction else []
    paired=[(int(i),int(j),float(matrix[i,j])) for i,j in pairs if matrix[i,j]>=.5]
    return paired


def diagnose(args):
    truth=json.loads(Path(args.annotations).read_text(encoding="utf-8-sig"));manifest=json.loads(Path(args.manifest).read_text(encoding="utf8"))
    if truth.get("schemaVersion")!="courtside.tracking-review.v1" or truth.get("videoSha256")!=manifest["video_sha256"] or digest(args.video)!=manifest["video_sha256"]:
        raise ValueError("Provisional annotations are not for the decoded input video")
    for filename,key in ((args.tracks,"tracks"),(args.detections,"detections")):
        if digest(filename)!=manifest["files"][key]["sha256"]:raise ValueError("Prediction provenance mismatch")
    def read(path):
        with Path(path).open(encoding="utf8") as stream:return [json.loads(line) for line in stream if line.strip()]
    raw={r["frame_index"]:r for r in read(args.detections)};tracked={}
    for r in read(args.tracks):
        if r["status"]=="detected":tracked.setdefault(r["frame_index"],[]).append(r)
    reports=[];last=-1;reference_count=0
    for frame in truth["frames"]:
        index=frame.get("frame_index");row=raw.get(index)
        if (type(index) is not int or index<=last or not row or abs(frame["time"]-row["pts_seconds"])>1e-6
            or frame["width"]!=row["width"] or frame["height"]!=row["height"]):raise ValueError("Provisional source frame/PTS differs")
        last=index;reference=[]
        for box in frame["boxes"]:
            b=box.get("bbox")
            if (not isinstance(b,list) or len(b)!=4 or not all(type(x) in (int,float) and math.isfinite(x) for x in b)
                or not (0<=b[0]<b[2]<=row["width"] and 0<=b[1]<b[3]<=row["height"]) or box.get("visibility") not in ("clear","occluded")):
                raise ValueError("Provisional box is invalid")
            reference.append(b)
        predicted=tracked.get(index,[]);visible=[r for r in predicted if r["included"]]
        raw_pairs=matches(reference,[b[:4] for b in row["boxes"]]);tracked_pairs=matches(reference,[r["bbox_xyxy_px"] for r in predicted]);included_pairs=matches(reference,[r["bbox_xyxy_px"] for r in visible])
        raw_matched={i for i,j,v in raw_pairs};tracked_matched={i for i,j,v in tracked_pairs};included_matched={i for i,j,v in included_pairs}
        problems=[]
        for i,box in enumerate(reference):
            if i in included_matched:continue
            best=max(((iou(box,r["bbox_xyxy_px"]),r) for r in predicted),key=lambda pair:pair[0],default=(0,None))
            reason=("detector_unmatched" if i not in raw_matched else "association_unmatched" if i not in tracked_matched else
                    best[1]["exclusion_reason"] if best[1] else "output_unmatched")
            problems.append({"reference_index":i,"bbox":box,"reason":reason,"best_tracked_iou":best[0]})
        near_duplicates=[(i,j) for i,a in enumerate(reference) for j,b in enumerate(reference) if i<j and iou(a,b)>.65]
        reports.append({"frame_index":index,"time":frame["time"],"references":len(reference),"raw_matches":len(raw_pairs),"tracked_matches":len(tracked_pairs),
                        "included_matches":len(included_pairs),"included_predictions":len(visible),"unmatched_included_predictions":len(visible)-len(included_pairs),
                        "near_duplicate_reference_pairs":near_duplicates,"unmatched_references":problems})
        reference_count+=len(reference)
    from collections import Counter
    result={"schemaVersion":"courtside.coarse-review-diagnostic.v1","annotationStatus":"user_supplied_provisional_not_confirmed",
            "annotationsSha256":digest(args.annotations),"videoSha256":manifest["video_sha256"],"manifestSha256":digest(args.manifest),
            "reviewFlags":{"reviewedFrames":sum(f.get("reviewed") is True for f in truth["frames"]),"hasAnnotator":bool(truth.get("annotator","").strip()),"annotationSource":truth.get("annotationSource")},
            "frames":reports,"summary":{"reference_boxes":reference_count,"raw_matches":sum(f["raw_matches"] for f in reports),
            "tracked_matches":sum(f["tracked_matches"] for f in reports),"included_matches":sum(f["included_matches"] for f in reports),
            "unmatched_included_predictions":sum(f["unmatched_included_predictions"] for f in reports),
            "unmatched_reference_reasons":dict(Counter(p["reason"] for f in reports for p in f["unmatched_references"]))},
            "limitations":["Unreviewed boxes may be incomplete or inaccurate; matches are exploratory proxies, not certified recall/precision.",
                           "Unmatched predictions may be unlabelled people, not necessarily false positives.","No continuous human IDs: HOTA/IDF1/ID switches are unavailable."]}
    Path(args.output).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf8")
    print(json.dumps({"video":manifest["video_sha256"],"summary":result["summary"]}))


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    for name in ("annotations","video","manifest","tracks","detections","output"):parser.add_argument("--"+name,required=True)
    diagnose(parser.parse_args())
