"""Explicit setup of a publisher-pinned local CLIP checkpoint, never inference-time setup."""
import hashlib
import json
from pathlib import Path
import uuid
import requests

ROOT = Path(__file__).resolve().parents[1]
SHA256 = "40d365715913c9da98579312b702a82c18be219cc2a73407c4526f58eba950af"
URL = f"https://openaipublic.azureedge.net/clip/models/{SHA256}/ViT-B-32.pt"
FILENAME = "clip-openai-vit-b32.pt"


def prepare():
    folder = ROOT / ".local/vision-models"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / FILENAME
    if not target.exists():
        part = folder / f"{FILENAME}.{uuid.uuid4()}.part"
        count = 0
        hasher = hashlib.sha256()
        with requests.get(URL, stream=True, timeout=(20, 60)) as response:
            response.raise_for_status()
            expected = int(response.headers.get("content-length", 0))
            with part.open("xb") as sink:
                for chunk in response.iter_content(1024 * 1024):
                    count += len(chunk)
                    if count > 500_000_000:
                        raise ValueError("Role checkpoint exceeds setup size limit")
                    sink.write(chunk)
                    hasher.update(chunk)
                    if count // (64 * 1024 * 1024) != (count - len(chunk)) // (64 * 1024 * 1024):
                        print(f"Downloaded {count // (1024 * 1024)} MiB", flush=True)
        if not count or (expected and count != expected) or hasher.hexdigest() != SHA256:
            raise ValueError("Downloaded checkpoint differs from publisher digest")
        part.rename(target)
    from detections import digest
    if digest(target) != SHA256:
        raise ValueError("Existing role checkpoint differs from publisher digest")
    record = {"schemaVersion": "courtside.player-role-model.v1", "name": "CLIP-ViT-B-32",
              "openClipModel": "ViT-B-32-quickgelu", "filename": FILENAME,
              "sha256": SHA256, "bytes": target.stat().st_size, "url": URL,
              "publisherDigestAvailable": True, "license": "MIT",
              "source": "https://github.com/openai/CLIP", "inference": "local_cpu_offline"}
    lock = ROOT / "vision/player-role-model-lock.json"
    if lock.exists() and json.loads(lock.read_text(encoding="utf8")) != record:
        raise ValueError("Existing role model lock differs; preserve it for review")
    lock.write_text(json.dumps(record, indent=2) + "\n", encoding="utf8")
    print(json.dumps(record), flush=True)


if __name__ == "__main__":
    prepare()
