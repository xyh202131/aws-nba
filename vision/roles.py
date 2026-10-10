"""Optional zero-shot crop review. Similarity is a candidate score, never an identity."""
import os
from pathlib import Path
import json
import numpy as np
from detections import digest

os.environ["HF_HUB_OFFLINE"]="1"
os.environ["TRANSFORMERS_OFFLINE"]="1"
ROOT=Path(__file__).resolve().parents[1]
LABELS=("player_candidate","referee_candidate","bystander_candidate")
PROMPTS=(
    ("a basketball player wearing a basketball jersey and shorts","a professional basketball athlete in a sleeveless uniform on the court","a basketball player running and jumping in team sportswear"),
    ("a basketball referee wearing a gray shirt and black pants","a sports official in a referee uniform watching a basketball game","a basketball referee with black sleeves and long trousers"),
    ("a spectator in casual clothes watching basketball","a basketball coach or arena staff wearing a jacket and long pants","a person sitting beside a basketball court in street clothes"),
)


class RoleEncoder:
    def __init__(self):
        import torch,open_clip
        lock=json.loads((ROOT/"vision/aux-model-lock.json").read_text(encoding="utf8"))["role"]
        path=ROOT/".local/vision-models"/lock["filename"]
        if digest(path)!=lock["sha256"]:raise ValueError("Role model hash mismatch")
        open_clip.add_model_config(ROOT/"vision/role-model-config.json")
        self.model,_,self.preprocess=open_clip.create_model_and_transforms("role-model-config",pretrained=None,device="cpu")
        original=torch.load(path,map_location="cpu",weights_only=True)["state_dict"]
        # Publisher checkpoint splits the two encoders across DDP wrappers.
        prefixes=("_image_encoder.module.","_text_encoder.module.","_logit_scale.module.")
        state={}
        for name,value in original.items():
            prefix=next((p for p in prefixes if name.startswith(p)),None)
            if prefix is None:raise ValueError("Unexpected publisher checkpoint namespace")
            state[name[len(prefix):]]=value
        self.model.load_state_dict(state,strict=True)
        self.model.eval();self.torch=torch;self.lock=lock
        tokenizer=open_clip.get_tokenizer("role-model-config")
        with torch.inference_mode():
            features=self.model.encode_text(tokenizer([text for group in PROMPTS for text in group]),normalize=True)
            self.text=features.reshape((3,3,-1)).mean(dim=1)
            self.text/=self.text.norm(dim=-1,keepdim=True)

    def score(self,crops):
        from PIL import Image
        with self.torch.inference_mode():
            images=self.torch.stack([self.preprocess(Image.fromarray(c[...,::-1].copy())) for c in crops])
            features=self.model.encode_image(images,normalize=True)
            scores=(features@self.text.T).cpu().numpy()
        return scores


def role_decision(scores,margin=.04):
    scores=np.asarray(scores,dtype=float)
    if scores.shape!=(3,) or not np.isfinite(scores).all():raise ValueError("Invalid role similarity")
    best=int(scores.argmax())
    separation=float(scores[best]-max(np.delete(scores,best)))
    # Keep uncertainty visible; this is not a calibrated classification probability.
    label=LABELS[best] if separation>=margin else "unknown"
    return {"role":label,"similarity":round(float(scores[best]),6),"margin":round(separation,6),"scores":[round(float(s),6) for s in scores]}
