"""Explicit one-time download from the publisher's model repository; runtime never downloads."""
import hashlib
import json
import os
from pathlib import Path
import requests

root = Path(__file__).resolve().parents[1]
profile = json.loads((root / "vision/profile.json").read_text(encoding="utf8"))
name = profile["weightsFile"]
repository = "Ultralytics/YOLO11"
metadata = requests.get(f"https://huggingface.co/api/models/{repository}?blobs=true", timeout=30)
metadata.raise_for_status()
asset = next(x for x in metadata.json()["siblings"] if x["rfilename"] == name)
expected = asset["lfs"]["sha256"]
if len(expected) != 64:
    raise ValueError("Publisher asset digest is missing")
folder = root / ".local/vision-models"
folder.mkdir(parents=True, exist_ok=True)
path = folder / name
url = f"https://huggingface.co/{repository}/resolve/main/{name}"
if not path.exists():
    temporary = folder / (name + ".verified.part")
    with requests.get(url, stream=True, timeout=(30, 60)) as response:
        response.raise_for_status()
        with temporary.open("wb") as sink:
            for chunk in response.iter_content(1024 * 1024):
                sink.write(chunk)
    actual = hashlib.sha256(temporary.read_bytes()).hexdigest()
    if actual != expected:
        raise ValueError("Downloaded model does not match the publisher digest")
    os.replace(temporary, path)
actual = hashlib.sha256(path.read_bytes()).hexdigest()
if actual != expected:
    raise ValueError("Existing model does not match the publisher digest")
lock = {"filename": name, "sha256": actual, "bytes": path.stat().st_size,
    "publisherRepository": repository, "publisherMirrorUrl": url,
    "upstreamUrl": profile["weightsUrl"], "license": profile["license"]}
(root / "vision/model-lock.json").write_text(json.dumps(lock, indent=2) + "\n", encoding="utf8")
print(json.dumps(lock), flush=True)
