"""Offline pretrained role evidence. No annotations, player identities, training or network."""
import json
import os
from pathlib import Path
import hashlib
import numpy as np

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
ROOT = Path(__file__).resolve().parents[1]
LABELS = ("player_candidate", "referee_candidate", "bystander_candidate")
PROMPTS = (
    ("a basketball player wearing a team basketball uniform on the court",
     "a professional basketball athlete wearing a sleeveless jersey and shorts",
     "a basketball player in a uniform with compression tights under shorts",
     "a basketball player running or defending in a team jersey",
     "a basketball player shooting or passing the ball during a game"),
    ("a basketball referee wearing a gray officiating shirt and long black pants",
     "a basketball referee wearing a black and gray referee uniform",
     "a sports official with a whistle officiating a basketball game",
     "a basketball game referee standing on the court in a referee shirt",
     "a basketball referee watching the players during a basketball match"),
    ("a spectator sitting in the stands watching a basketball game",
     "a basketball coach wearing casual clothes standing at the sideline",
     "basketball arena staff or bench personnel wearing a tracksuit",
     "a courtside spectator wearing street clothes at a basketball game",
     "a photographer or camera operator working beside a basketball court"),
)
PROMPTS_SHA256 = hashlib.sha256(json.dumps(PROMPTS, separators=(",", ":")).encode()).hexdigest()
CROP_TRANSFORM = "full_box_gray_pad224_v1"


def person_crop(image, box):
    from PIL import Image, ImageOps
    height, width = image.shape[:2]
    values = np.asarray(box, dtype=float)
    if values.shape != (4,) or not np.isfinite(values).all():
        raise ValueError("Invalid person role crop")
    x1, y1 = np.floor(values[:2]).astype(int)
    x2, y2 = np.ceil(values[2:]).astype(int)
    if not (0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height):
        raise ValueError("Person role crop is outside decoded image")
    # Tall person crops must preserve both the jersey and legs, not center-cut them.
    crop = Image.fromarray(image[y1:y2, x1:x2, ::-1].copy())
    return ImageOps.pad(crop, (224, 224), method=Image.Resampling.BICUBIC, color=(127, 127, 127))


def role_evidence(scores, margin):
    values = np.asarray(scores, dtype=float)
    if values.shape != (3,) or not np.isfinite(values).all() or (np.abs(values) > 1.00001).any():
        raise ValueError("Invalid role similarity")
    best = int(values.argmax())
    gap = float(values[best] - max(np.delete(values, best)))
    return {"role": LABELS[best] if gap >= margin else "unknown",
            "similarity": float(values[best]), "margin": gap,
            "scores": [float(v) for v in values], "status": "model_candidate"}


class SemanticRoleEncoder:
    def __init__(self, threads=2):
        from detections import digest
        import torch
        import open_clip
        import importlib.metadata
        self.lock = json.loads((ROOT / "vision/player-role-model-lock.json").read_text(encoding="utf8"))
        if self.lock.get("name") != "CLIP-ViT-B-32" or self.lock.get("filename") != "clip-openai-vit-b32.pt":
            raise ValueError("Unsupported role checkpoint")
        path = ROOT / ".local/vision-models" / self.lock["filename"]
        if digest(path) != self.lock["sha256"] or path.stat().st_size != self.lock["bytes"]:
            raise ValueError("Role checkpoint hash or size mismatch")
        torch.set_num_threads(threads)
        # The publisher archive is TorchScript. Use the official OpenAI loader on
        # the verified local path, avoiding unsafe pickle fallback or downloads.
        from open_clip.openai import load_openai_model
        from open_clip.transform import image_transform
        self.model = load_openai_model(str(path), precision="fp32", device="cpu")
        self.preprocess = image_transform(224, is_train=False,
            mean=self.model.visual.image_mean, std=self.model.visual.image_std)
        self.model.eval()
        self.torch = torch
        tokenizer = open_clip.get_tokenizer(self.lock["openClipModel"])
        with torch.inference_mode():
            features = self.model.encode_text(tokenizer([s for group in PROMPTS for s in group]), normalize=True)
            self.text = features.reshape(3, len(PROMPTS[0]), -1).mean(dim=1)
            self.text /= self.text.norm(dim=-1, keepdim=True)
        self.version = importlib.metadata.version("open_clip_torch")
        self.inferred_crops = 0

    def score(self, image, boxes):
        if not boxes:
            return np.empty((0, 3))
        if len(boxes) > 64:
            raise ValueError("Role inference batch is oversized")
        tensors = self.torch.stack([self.preprocess(person_crop(image, b)) for b in boxes])
        with self.torch.inference_mode():
            features = self.model.encode_image(tensors, normalize=True)
            scores = (features @ self.text.T).cpu().numpy()
        if scores.shape != (len(boxes), 3) or not np.isfinite(scores).all():
            raise ValueError("Role inference returned invalid evidence")
        self.inferred_crops += len(boxes)
        return scores
