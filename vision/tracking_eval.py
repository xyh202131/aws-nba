"""Independent continuous-ID review and official TrackEval adapter. Never auto-label truth."""
import argparse
import json
import math
from pathlib import Path
import re
import sys
import numpy as np
from detections import digest
from quality import iou,REVIEW_HTML


def load_jsonl(path):
    with Path(path).open(encoding="utf8") as source:return [json.loads(line) for line in source if line.strip()]


def checked_inputs(args):
    manifest=json.loads(Path(args.manifest).read_text(encoding="utf8"))
    if digest(args.detections)!=manifest["files"]["detections"]["sha256"]:raise ValueError("Raw detection source hash mismatch")
    return manifest,load_jsonl(args.detections)


def prepare(args):
    import av
    import cv2
    from core import normalize_display
    manifest,raw=checked_inputs(args)
    if digest(args.video)!=manifest["video_sha256"]:raise ValueError("Review video source differs")
    if not math.isfinite(args.start) or args.start<0 or args.start+5>manifest["duration"]:raise ValueError("Choose a five-second interval within the source")
    output=Path(args.output).resolve();output.mkdir(parents=True,exist_ok=False)
    selected=[];cursor=0
    for i in range(50):
        target=args.start+i*.1
        while cursor<len(raw) and raw[cursor]["pts_seconds"]+1e-6<target:cursor+=1
        if cursor==len(raw) or raw[cursor]["pts_seconds"]-target>.07:raise ValueError("Tracking samples cannot cover a 10 Hz review without interpolation")
        selected.append(raw[cursor]);cursor+=1
    wanted={r["frame_index"]:r for r in selected};frames=[]
    with av.open(args.video,options={"protocol_whitelist":"file,pipe"}) as container:
        stream=container.streams.video[0];stream.codec_context.thread_count=2
        for index,frame in enumerate(container.decode(stream)):
            if index not in wanted:continue
            row=wanted[index];stamp=float(frame.pts*frame.time_base)-manifest["time_origin_seconds"]
            if abs(stamp-row["pts_seconds"])>1e-6:raise ValueError("Source PTS does not match tracking frame")
            image=normalize_display(frame.to_ndarray(format="bgr24"),float(stream.sample_aspect_ratio or 1),int(frame.rotation))
            filename=f"frame-{len(frames):02d}.jpg"
            if not cv2.imwrite(str(output/filename),image):raise ValueError("Review image write failed")
            segment=next(s["id"] for s in manifest["segments"] if s["start"]<=stamp<s["end"])
            frames.append({"frame_index":index,"time":stamp,"image":filename,"image_sha256":digest(output/filename),
                           "width":image.shape[1],"height":image.shape[0],"segment_id":segment,"reviewed":False,"boxes":[]})
            if len(frames)==50:break
    if len(frames)!=50:raise ValueError("Could not decode all selected review frames")
    template={"schemaVersion":"courtside.continuous-review.v1","videoSha256":manifest["video_sha256"],"annotator":"",
              "annotationSource":"human_required","predictionScope":"size_qualified_observations","requestedStart":args.start,
              "sampleHz":10,"minHeightRatio":.09,"frames":frames}
    (output/"annotations.json").write_text(json.dumps(template,ensure_ascii=False,indent=2),encoding="utf8")
    html=REVIEW_HTML.replace("人物定位独立核对","连续匿名 ID 独立核对").replace("${index+1}/30","${index+1}/${data.frames.length}")
    html=html.replace("请在原始画面上拖动框出所有可见场内球员；这是参考标注，不预填模型框。球员被遮挡时应记录遮挡情况，不能为提升指标漏标清晰球员。完成当前帧后勾选核对，再导出 JSON。自动检测覆盖率不代表精确率。",
                      "在原始画面上标注所有框高至少为画面 9% 的可见人物（包括裁判、场边未知人物），填入稳定 H 编号，不使用模型 T 编号作为真值。每次画框前确认编号；同一镜头内同一人物沿用编号，切镜后重新标注。遮挡另记；本工具评估尺寸合格观测的 ID 连续性，不能认证 NBA 球员身份或场内筛选精度。")
    html=html.replace('<label>新框可见性', '<label>独立人物编号 <input id="human-id" value="H001" pattern="H[0-9]{3,6}"></label><label>新框可见性')
    html=html.replace('`${i+1} ${b.visibility}`','`${b.id} ${b.visibility}`')
    html=html.replace('data.frames[index].boxes.push({bbox:box,visibility:',
                      'const id=document.querySelector("#human-id").value.trim();if(!/^H[0-9]{3,6}$/.test(id)||data.frames[index].boxes.some(b=>b.id===id)){alert("请使用当前帧未出现的 H 编号");return;}data.frames[index].boxes.push({id,bbox:box,visibility:')
    html=html.replace("data.annotator=document.querySelector('#reviewer').value.trim();", "data.annotator=document.querySelector('#reviewer').value.trim();data.annotationSource=data.annotator&&data.frames.every(f=>f.reviewed)?'human_confirmed':'human_required';")
    html=html.replace("a.download='annotations.json'","a.download='continuous-annotations.json'")
    (output/"review.html").write_text(html.replace("__DATA__",json.dumps(template,ensure_ascii=False).replace("<","\\u003c")),encoding="utf8")
    print(json.dumps({"status":"awaiting_human_annotation","frames":50,"review":str(output/"review.html")}))


def build_eval_data(truth,rows,raw,video_hash):
    if (truth.get("schemaVersion")!="courtside.continuous-review.v1" or truth.get("videoSha256")!=video_hash
        or truth.get("annotationSource")!="human_confirmed" or not truth.get("annotator","").strip()
        or truth.get("predictionScope")!="size_qualified_observations" or len(truth.get("frames",[]))<50
        or not all(f.get("reviewed") is True for f in truth["frames"])):
        raise ValueError("At least 50 independently confirmed frames with continuous human IDs are required")
    source={r["frame_index"]:r for r in raw};predictions={};gt_keys=set();pred_keys=set();gt_boxes=[];pred_boxes=[];gt_names=[];pred_names=[]
    for row in rows:
        if row["status"]=="detected":predictions.setdefault(row["frame_index"],[]).append(row)
    last=-1;previous_time=-1
    for frame in truth["frames"]:
        index=frame.get("frame_index");stamp=frame.get("time");observed=source.get(index)
        if (type(index) is not int or index<=last or not observed or type(stamp) not in (float,int) or not math.isfinite(stamp)
            or stamp<=previous_time or abs(stamp-observed["pts_seconds"])>1e-6 or frame["width"]!=observed["width"] or frame["height"]!=observed["height"]
            or not re.fullmatch(r"S\d{3,6}",frame.get("segment_id",""))):raise ValueError("Human frame mapping or coordinate plane is invalid")
        last=index;previous_time=stamp;seen=set();boxes=[];names=[]
        for box in frame["boxes"]:
            name=box.get("id","");bounds=box.get("bbox")
            if (not re.fullmatch(r"H\d{3,6}",name) or name in seen or box.get("visibility") not in ("clear","occluded")
                or not isinstance(bounds,list) or len(bounds)!=4 or not all(type(v) in (float,int) and math.isfinite(v) for v in bounds)
                or not (0<=bounds[0]<bounds[2]<=frame["width"] and 0<=bounds[1]<bounds[3]<=frame["height"])
                or bounds[3]-bounds[1]<frame["height"]*.09):raise ValueError("Human ID, box or visibility is invalid")
            seen.add(name);key=frame["segment_id"]+"/"+name;gt_keys.add(key);names.append(key);boxes.append(bounds)
        gt_boxes.append(boxes);gt_names.append(names)
        predicted=predictions.get(index,[]);seen=set();bounds=[];names=[]
        for row in predicted:
            if row["segment_id"]!=frame["segment_id"] or abs(row["pts_seconds"]-stamp)>1e-6:raise ValueError("Prediction segment or PTS differs")
            key=row["segment_id"]+"/"+row["track_id"]
            if key in seen:raise ValueError("Duplicate predicted ID in frame")
            seen.add(key);pred_keys.add(key);names.append(key);bounds.append(row["bbox_xyxy_px"])
        pred_boxes.append(bounds);pred_names.append(names)
    gt_map={key:i for i,key in enumerate(sorted(gt_keys))};pred_map={key:i for i,key in enumerate(sorted(pred_keys))}
    if not gt_map:raise ValueError("No confirmed human IDs; identity accuracy is unavailable, not zero")
    return {"num_timesteps":len(gt_boxes),"num_gt_ids":len(gt_map),"num_tracker_ids":len(pred_map),
            "num_gt_dets":sum(map(len,gt_boxes)),"num_tracker_dets":sum(map(len,pred_boxes)),
            "gt_ids":[np.array([gt_map[key] for key in frame],dtype=int) for frame in gt_names],
            "tracker_ids":[np.array([pred_map[key] for key in frame],dtype=int) for frame in pred_names],
            "similarity_scores":[np.array([[iou(a,b) for b in p] for a in g],dtype=float).reshape(len(g),len(p)) for g,p in zip(gt_boxes,pred_boxes)],
            "gt_boxes":gt_boxes,"tracker_boxes":pred_boxes}


def metric_results(data):
    from trackeval.metrics import HOTA,Identity,CLEAR
    hota=HOTA().eval_sequence(data);identity=Identity({"PRINT_CONFIG":False}).eval_sequence(data);clear=CLEAR({"PRINT_CONFIG":False}).eval_sequence(data)
    return {"HOTA":float(np.mean(hota["HOTA"])),"DetA":float(np.mean(hota["DetA"])),"AssA":float(np.mean(hota["AssA"])),
            "IDF1":float(identity["IDF1"]),"ID_switches":int(clear["IDSW"]),"MOTA":float(clear["MOTA"])}


def evaluate(args):
    manifest,raw=checked_inputs(args)
    if digest(args.tracks)!=manifest["files"]["tracks"]["sha256"]:raise ValueError("Track file hash mismatch")
    truth=json.loads(Path(args.annotations).read_text(encoding="utf8"))
    # All provenance and review checks precede importing/running any metric.
    data=build_eval_data(truth,load_jsonl(args.tracks),raw,manifest["video_sha256"])
    # GT segments must come from source cut boundaries, not edited IDs.
    for frame in truth["frames"]:
        if not any(s["id"]==frame["segment_id"] and s["start"]<=frame["time"]<s["end"] for s in manifest["segments"]):
            raise ValueError("Human segment differs from source scene boundaries")
    output=Path(args.output).resolve();output.mkdir(parents=True,exist_ok=False)
    for kind,ids_key,boxes_key in (("gt","gt_ids","gt_boxes"),("tracker","tracker_ids","tracker_boxes")):
        lines=[]
        for i,(ids,boxes) in enumerate(zip(data[ids_key],data[boxes_key]),1):
            for ident,box in zip(ids,boxes):
                x,y,x2,y2=box;lines.append(f"{i},{int(ident)+1},{x},{y},{x2-x},{y2-y},1,1,1,-1")
        (output/(kind+".txt")).write_text("\n".join(lines),encoding="utf8")
    mapping=[{"mot_frame":i+1,"source_frame_index":f["frame_index"],"pts_seconds":f["time"],"segment_id":f["segment_id"]} for i,f in enumerate(truth["frames"])]
    (output/"frame-map.json").write_text(json.dumps(mapping,indent=2),encoding="utf8")
    result={"schemaVersion":"courtside.trackeval-report.v1","trackevalVersion":"1.3.0","videoSha256":manifest["video_sha256"],
            "annotationsSha256":digest(args.annotations),"tracksSha256":digest(args.tracks),"detectionsSha256":digest(args.detections),
            "annotator":truth["annotator"],"reviewedFrames":data["num_timesteps"],"predictionScope":truth["predictionScope"],"metrics":metric_results(data),
            "metricScale":"0..1 except ID_switches, MOTA may be negative","limitations":["Sampled continuous-person IDs do not establish NBA identity or role accuracy.","All size-qualified measured observations are evaluated, including out-of-floor observations; overlay ROI quality is a separate test.","No interpolation; source scene cuts create independent ID namespaces."]}
    (output/"report.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf8");print(json.dumps(result,ensure_ascii=False))


if __name__=="__main__":
    parser=argparse.ArgumentParser();commands=parser.add_subparsers(dest="command",required=True)
    for command in ("prepare","evaluate"):
        child=commands.add_parser(command)
        for key in ("manifest","detections","output"):child.add_argument("--"+key,required=True)
        if command=="prepare":child.add_argument("--video",required=True);child.add_argument("--start",type=float,required=True)
        else:
            child.add_argument("--annotations",required=True);child.add_argument("--tracks",required=True)
    args=parser.parse_args()
    try:(prepare if args.command=="prepare" else evaluate)(args)
    except ValueError as error:
        print(json.dumps({"status":"refused","reason":str(error),"metrics":None}),file=sys.stderr);sys.exit(2)
