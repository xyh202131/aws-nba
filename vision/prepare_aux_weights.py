"""Explicit local setup only. Download public publisher assets; inference stays offline."""
import hashlib
import json
from pathlib import Path
import requests

ROOT=Path(__file__).resolve().parents[1]
FOLDER=ROOT/".local/vision-models"
FOLDER.mkdir(parents=True,exist_ok=True)
assets=[
    {"key":"appearance","filename":"yolo26n-reid.onnx","url":"https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo26n-reid.onnx","sha256":"8529c383197ae4c468eda535d1b165f8b4162cf17bf5fbcff49c7cb6455bc0bb","bytes":9873245,"license":"AGPL-3.0","publisherDigestAvailable":True},
    {"key":"role","filename":"TinyCLIP-ViT-8M-16-Text-3M-YFCC15M.pt","url":"https://github.com/wkcn/TinyCLIP-model-zoo/releases/download/checkpoints/TinyCLIP-ViT-8M-16-Text-3M-YFCC15M.pt","bytes":46948845,"license":"MIT","publisherDigestAvailable":False},
]
records={}
for asset in assets:
    path=FOLDER/asset["filename"]
    if not path.exists():
        part=FOLDER/(asset["filename"]+".part")
        with requests.get(asset["url"],stream=True,timeout=(30,60)) as response:
            response.raise_for_status()
            with part.open("wb") as sink:
                for chunk in response.iter_content(1024*1024):sink.write(chunk)
        if part.stat().st_size!=asset["bytes"]:raise ValueError("Asset size mismatch")
        if asset.get("sha256") and hashlib.sha256(part.read_bytes()).hexdigest()!=asset["sha256"]:raise ValueError("Publisher digest mismatch")
        part.replace(path)
    actual=hashlib.sha256(path.read_bytes()).hexdigest()
    if path.stat().st_size!=asset["bytes"] or (asset.get("sha256") and actual!=asset["sha256"]):raise ValueError("Existing asset mismatch")
    records[asset["key"]]={**asset,"sha256":actual}
    print(json.dumps({"prepared":asset["key"],"sha256":actual,"bytes":path.stat().st_size}),flush=True)
(ROOT/"vision/aux-model-lock.json").write_text(json.dumps(records,indent=2)+"\n",encoding="utf8")
