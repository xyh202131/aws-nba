"""Prepare independent review frames, then evaluate supplied annotations (never auto-label truth)."""
import argparse
import hashlib
import json
import math
from pathlib import Path


def sample(args):
    import av
    import cv2
    from core import normalize_display
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf8"))
    if hashlib.sha256(Path(args.video).read_bytes()).hexdigest() != manifest["video_sha256"]:
        raise ValueError("Review video differs from tracking input")
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    if (output/"annotations.json").exists():
        raise ValueError("Review annotations already exist; choose a new output directory to preserve human work")
    # Include the cut boundary and adjacent frames, then cover the remaining video uniformly.
    times = sorted({round(max(0,min(manifest["duration"]-.001,segment["start"]+offset)),6)
                    for segment in manifest["segments"][1:] for offset in (-.1,0,.1)})
    if len(times)>12:
        times=[times[round(i*(len(times)-1)/11)] for i in range(12)]
    remaining = 30-len(times)
    for i in range(remaining):
        time=manifest["duration"]*(i+.5)/remaining
        if time in times:time+=.001
        times.append(time)
    times.sort()
    frames = []
    with av.open(args.video, options={"protocol_whitelist":"file,pipe"}) as container:
        stream = container.streams.video[0]
        origin = manifest["time_origin_seconds"]
        for index, frame in enumerate(container.decode(stream)):
            time = float(frame.pts * frame.time_base) - origin
            if len(frames) >= len(times):
                break
            if time < times[len(frames)]:
                continue
            image = normalize_display(frame.to_ndarray(format="bgr24"),float(stream.sample_aspect_ratio or 1),int(frame.rotation))
            filename = f"frame-{len(frames):02d}.jpg"
            if not cv2.imwrite(str(output / filename), image):
                raise ValueError("Review frame write failed")
            frames.append({"frame_index":index,"time":round(time,6),"image":filename,"width":image.shape[1],"height":image.shape[0],"reviewed":False,"boxes":[]})
    if len(frames) != 30:
        raise ValueError("Could not extract all 30 independent review frames")
    template = {"schemaVersion":"courtside.tracking-review.v1","videoSha256":manifest["video_sha256"],"annotator":"","annotationSource":"human_required","frames":frames}
    (output / "annotations.json").write_text(json.dumps(template,ensure_ascii=False,indent=2),encoding="utf8")
    (output / "review.html").write_text(REVIEW_HTML.replace("__DATA__",json.dumps(template,ensure_ascii=False).replace("<","\\u003c")),encoding="utf8")
    print(json.dumps({"frames":len(frames),"review":str((output/"review.html").resolve()),"status":"awaiting_human_annotation"}))


def iou(a,b):
    intersection = max(0,min(a[2],b[2])-max(a[0],b[0])) * max(0,min(a[3],b[3])-max(a[1],b[1]))
    union = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - intersection
    return intersection/union if union > 0 else 0


def evaluate(args):
    import numpy as np
    from scipy.optimize import linear_sum_assignment
    annotations = json.loads(Path(args.annotations).read_text(encoding="utf8"))
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf8"))
    if annotations.get("schemaVersion") != "courtside.tracking-review.v1" or annotations.get("videoSha256") != manifest["video_sha256"]:
        raise ValueError("Annotation source hash or protocol is invalid")
    if not annotations.get("annotator","").strip() or len(annotations["frames"]) < 30 or not all(f.get("reviewed") is True for f in annotations["frames"]):
        raise ValueError("All 30 frames require explicit independent annotation; no accuracy is inferred from detections")
    indices = set()
    last_time = -1
    for frame in annotations["frames"]:
        index, stamp = frame.get("frame_index"), frame.get("time")
        if type(index) is not int or index < 0 or index in indices or not isinstance(stamp,(float,int)) or not math.isfinite(stamp) or not last_time < stamp < manifest["duration"] or frame.get("width") != manifest["width"] or frame.get("height") != manifest["height"] or not isinstance(frame.get("boxes"),list):
            raise ValueError("Annotation frame index, time or coordinate plane is invalid")
        indices.add(index); last_time = stamp
        for box in frame["boxes"]:
            coordinates = box.get("bbox")
            if box.get("visibility") not in ("clear","occluded") or not isinstance(coordinates,list) or len(coordinates) != 4 or not all(type(v) in (int,float) and math.isfinite(v) for v in coordinates) or not (0 <= coordinates[0] < coordinates[2] <= manifest["width"] and 0 <= coordinates[1] < coordinates[3] <= manifest["height"]):
                raise ValueError("Annotation box or visibility is invalid")
    if hashlib.sha256(Path(args.tracks).read_bytes()).hexdigest() != manifest["files"]["tracks"]["sha256"]:
        raise ValueError("Tracking observations differ from the declared artifact")
    by_frame = {}
    with Path(args.tracks).open(encoding="utf8") as source:
        for line in source:
            row = json.loads(line)
            if row["status"] == "detected" and row["included"]:
                by_frame.setdefault(row["frame_index"],[]).append(row)
    true_positive = false_positive = missed = occluded_matched = occluded_missed = 0
    for frame in annotations["frames"]:
        truth = frame["boxes"]
        detections = by_frame.get(frame["frame_index"],[])
        matrix = np.array([[iou(g["bbox"],p["bbox_xyxy_px"]) for p in detections] for g in truth])
        matched_truth = set()
        if truth and detections:
            cost = np.where(matrix >= .5,1-matrix,1e6)
            rows,cols = linear_sum_assignment(cost)
            matched_truth = {int(r) for r,c in zip(rows,cols) if matrix[r,c] >= .5}
        # Matched occluded people are neither clear true positives nor false positives.
        false_positive += len(detections)-len(matched_truth)
        for index, box in enumerate(truth):
            if box["visibility"] == "clear":
                true_positive += int(index in matched_truth)
                missed += int(index not in matched_truth)
            else:
                occluded_matched += int(index in matched_truth)
                occluded_missed += int(index not in matched_truth)
    precision = true_positive/(true_positive+false_positive) if true_positive+false_positive else None
    recall = true_positive/(true_positive+missed) if true_positive+missed else None
    report = {"schemaVersion":"courtside.tracking-quality.v1","videoSha256":manifest["video_sha256"],"annotator":annotations["annotator"],"reviewedFrames":len(annotations["frames"]),"iouThreshold":.5,"clearSample":{"truePositive":true_positive,"falsePositive":false_positive,"missed":missed,"precision":precision,"recall":recall},"occludedSample":{"matched":occluded_matched,"missed":occluded_missed,"recall":occluded_matched/(occluded_matched+occluded_missed) if occluded_matched+occluded_missed else None},"detectionTargetMet":precision is not None and recall is not None and precision>=.9 and recall>=.9,"limitations":["Clear precision counts unmatched predictions; matched occluded boxes are excluded from that denominator.","Detection metrics alone do not certify identity continuity or zero ID switches."]}
    Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf8")
    print(json.dumps(report,ensure_ascii=False))


REVIEW_HTML = """<!doctype html><html lang="zh"><meta charset="utf-8"><title>人物定位独立核对</title>
<style>body{background:#101c28;color:#e8f2f1;font:16px system-ui;margin:28px}button,input{font:inherit;margin:8px;padding:8px}canvas{max-width:100%;background:#080e15;border:1px solid #6be0cf}p{max-width:1000px}</style>
<h1>人物定位独立核对</h1><p>请在原始画面上拖动框出所有可见场内球员；这是参考标注，不预填模型框。球员被遮挡时应记录遮挡情况，不能为提升指标漏标清晰球员。完成当前帧后勾选核对，再导出 JSON。自动检测覆盖率不代表精确率。</p>
<input id="reviewer" aria-label="标注者" placeholder="标注者"><button id="previous">上一帧</button><button id="next">下一帧</button><label><input type="checkbox" id="reviewed">当前帧已逐人核对</label>
<label>新框可见性 <select id="visibility"><option value="clear">清晰</option><option value="occluded">遮挡</option></select></label><button id="undo">撤销最后一个框</button><button id="clear">清空当前框</button><button id="save">导出标注 JSON</button><p id="caption"></p><canvas id="canvas" style="touch-action:none"></canvas>
<script>
const data=__DATA__;
let index=0,start=null;
const canvas=document.querySelector('#canvas'),ctx=canvas.getContext('2d'),image=new Image(),checked=document.querySelector('#reviewed');
function draw(){
  const f=data.frames[index];ctx.drawImage(image,0,0);ctx.lineWidth=2;
  f.boxes.forEach((b,i)=>{const a=b.bbox;ctx.strokeStyle=b.visibility==='clear'?'#6be0cf':'#f5bb72';ctx.fillStyle=ctx.strokeStyle;ctx.strokeRect(a[0],a[1],a[2]-a[0],a[3]-a[1]);ctx.fillText(`${i+1} ${b.visibility}`,a[0],Math.max(12,a[1]-3));});
  document.querySelector('#caption').textContent=`${index+1}/30 · ${f.time}s · ${f.boxes.length} 个参考框`;
}
function show(){const f=data.frames[index];canvas.width=f.width;canvas.height=f.height;checked.checked=f.reviewed;image.src=f.image;}
function changed(){data.frames[index].reviewed=false;checked.checked=false;draw();}
image.onload=draw;
function p(e){const r=canvas.getBoundingClientRect();return[Math.max(0,Math.min(canvas.width,(e.clientX-r.left)*canvas.width/r.width)),Math.max(0,Math.min(canvas.height,(e.clientY-r.top)*canvas.height/r.height))];}
canvas.onpointerdown=e=>{start=p(e);canvas.setPointerCapture(e.pointerId);};
canvas.onpointerup=e=>{if(!start)return;const end=p(e);const box=[Math.min(start[0],end[0]),Math.min(start[1],end[1]),Math.max(start[0],end[0]),Math.max(start[1],end[1])].map(Math.round);start=null;if(box[2]-box[0]<5||box[3]-box[1]<5)return;data.frames[index].boxes.push({bbox:box,visibility:document.querySelector('#visibility').value});changed();};
canvas.onpointercancel=()=>{start=null;};
document.querySelector('#previous').onclick=()=>{index=Math.max(0,index-1);show();};
document.querySelector('#next').onclick=()=>{index=Math.min(data.frames.length-1,index+1);show();};
checked.onchange=()=>data.frames[index].reviewed=checked.checked;
document.querySelector('#undo').onclick=()=>{data.frames[index].boxes.pop();changed();};
document.querySelector('#clear').onclick=()=>{data.frames[index].boxes=[];changed();};
document.querySelector('#save').onclick=()=>{data.annotator=document.querySelector('#reviewer').value.trim();const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download='annotations.json';a.click();URL.revokeObjectURL(a.href);};show();
</script></html>"""


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command",required=True)
    sampler = commands.add_parser("sample")
    for key in ("video","manifest","output"): sampler.add_argument("--"+key,required=True)
    evaluator = commands.add_parser("evaluate")
    for key in ("annotations","manifest","tracks","output"): evaluator.add_argument("--"+key,required=True)
    arguments = parser.parse_args()
    (sample if arguments.command=="sample" else evaluate)(arguments)
