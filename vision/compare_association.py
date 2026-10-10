"""Local controlled comparison using content-addressed measured detections, no AWS."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import uuid
import yaml
from detections import digest

ROOT=Path(__file__).resolve().parents[1]


def run(args):
    directory=Path(args.output).resolve()/str(uuid.uuid4())
    directory.mkdir(parents=True)
    source=Path(args.video).resolve(strict=True)
    profile=json.loads((ROOT/"vision/profile.json").read_text(encoding="utf8"))
    tracker=yaml.safe_load((ROOT/"vision/tracker.yaml").read_text(encoding="utf8"))
    lock=json.loads((ROOT/"vision/model-lock.json").read_text(encoding="utf8"))
    weights=ROOT/".local/vision-models"/lock["filename"]
    if digest(weights)!=lock["sha256"]:raise ValueError("Weights hash mismatch")
    video_hash=digest(source)
    variants=[("baseline",True,"floor_qualified",False),("motion",False,"floor_qualified",False),
              ("late-floor-score",True,"size_qualified",False),("late-floor-motion",False,"size_qualified",False)]
    if args.experimental_reid:variants.append(("appearance",False,"floor_qualified",True))
    records=[]
    for name,fuse,scope,appearance in variants:
        folder=directory/name;folder.mkdir()
        p={**profile,"associationScope":scope,"appearance":appearance,"appearanceRefreshSeconds":.25}
        t={**tracker,"fuse_score":fuse,"with_reid":False,"model":"auto"}
        profile_path=folder/"profile.json";tracker_path=folder/"tracker.yaml"
        profile_path.write_text(json.dumps(p,indent=2),encoding="utf8")
        tracker_path.write_text(yaml.safe_dump(t),encoding="utf8")
        command=[sys.executable,str(ROOT/"vision/track.py"),"--video",str(source),"--output",str(folder),
                 "--weights",str(weights),"--video-hash",video_hash,"--weights-hash",lock["sha256"],
                 "--profile",str(profile_path),"--tracker",str(tracker_path),"--duration",str(args.duration)]
        result=subprocess.run(command,capture_output=True,text=True,timeout=900)
        (folder/"process.log").write_text(result.stdout+result.stderr,encoding="utf8")
        if result.returncode:raise RuntimeError(f"{name} failed, inspect {folder}")
        manifest=json.loads((folder/"tracking-manifest.json").read_text(encoding="utf8"))
        records.append({"variant":name,"manifest":manifest})
        print(json.dumps({"variant":name,"stats":manifest["stats"],"resources":manifest["resources"]}),flush=True)
    hashes={r["manifest"]["detection_cache"]["sha256"] for r in records}
    if len(hashes)!=1:raise ValueError("The variants did not use identical measured detections")
    (directory/"comparison.json").write_text(json.dumps(records,indent=2),encoding="utf8")
    print(str(directory))


if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("video");parser.add_argument("--duration",required=True,type=float)
    parser.add_argument("--output",default=str(ROOT/".local/association-comparisons"));parser.add_argument("--experimental-reid",action="store_true")
    run(parser.parse_args())
