"""Generic role gating; no video whitelist, annotation reads or NBA identity binding."""


from math import isfinite
import json
from semantic_roles import role_evidence, SemanticRoleEncoder, PROMPTS_SHA256, CROP_TRANSFORM


class RoleGate:
    def __init__(self, margin=.02, ttl=.6):
        if not 0 < margin <= .2 or not 0 < ttl <= 1:
            raise ValueError("Invalid role gate policy")
        self.margin = margin
        self.ttl = ttl
        self.states = {}

    def update(self, key, stamp, scores):
        evidence = role_evidence(scores, self.margin)
        previous = self.states.get(key)
        if not isfinite(stamp) or (previous and stamp <= previous["stamp"]):
            raise ValueError("Role samples must have distinct increasing source timestamps")
        consecutive = (previous and stamp - previous["stamp"] <= self.ttl
                       and previous["evidence"]["role"] == evidence["role"])
        self.states[key] = {"stamp": stamp, "evidence": evidence,
                            "votes": previous["votes"] + 1 if consecutive else 1}

    def apply(self, row):
        key = (row["segment_id"], row["track_id"])
        if row["status"] != "detected":
            self.states.pop(key, None)
            return row
        state = self.states.get(key)
        if not state or not 0 <= row["pts_seconds"] - state["stamp"] <= self.ttl:
            return row
        evidence = state["evidence"]
        if evidence["role"] in ("referee_candidate", "bystander_candidate") and state["votes"] >= 2:
            row["included"] = False
            row["exclusion_reason"] = "semantic_" + evidence["role"]
        elif (evidence["role"] == "player_candidate" and evidence["margin"] >= .10
              and row.get("exclusion_reason") == "floor_region_unavailable"):
            row["included"] = True
            row["exclusion_reason"] = None
        return row


def box_overlap(a, b):
    intersection = max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))
    union = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - intersection
    return intersection / union if union > 0 else 0


class UniversalPlayerFilter:
    """Fresh evidence only; generic prompts never read reference boxes or identities."""
    def __init__(self, evidence_path, threads=2, encoder=None):
        self.encoder = encoder if encoder is not None else SemanticRoleEncoder(threads)
        self.gate = RoleGate()
        self.refresh_seconds = .33
        self.last_boxes = {}
        self.suppressed = self.restored = 0
        self.sink = evidence_path.open("w", encoding="utf8", newline="\n")

    def reset(self):
        self.last_boxes.clear()
        self.gate.states.clear()

    def observe(self, image, rows, stamp, index):
        pending = []
        for row in rows:
            key = (row["segment_id"], row["track_id"])
            if row["status"] != "detected":
                self.last_boxes.pop(key, None)
                self.gate.apply(row)
                continue
            box = row["bbox_xyxy_px"]
            previous_box = self.last_boxes.get(key)
            if previous_box and box_overlap(previous_box, box) < .25:
                self.gate.states.pop(key, None)
            self.last_boxes[key] = box
            state = self.gate.states.get(key)
            if not state or stamp - state["stamp"] >= self.refresh_seconds:
                pending.append(row)
        for start in range(0, len(pending), 32):
            batch = pending[start:start+32]
            for row, scores in zip(batch, self.encoder.score(image, [r["bbox_xyxy_px"] for r in batch])):
                key = (row["segment_id"], row["track_id"])
                self.gate.update(key, stamp, scores)
                self.sink.write(json.dumps({
                    "schema_version": "courtside.person-role-evidence.v1",
                    "video_sha256": row["video_sha256"], "frame_index": index,
                    "pts_seconds": stamp, "segment_id": key[0], "track_id": key[1],
                    "bbox_xyxy_px": row["bbox_xyxy_px"],
                    "model_sha256": self.encoder.lock["sha256"],
                    "evidence": self.gate.states[key]["evidence"],
                    "consecutive_samples": self.gate.states[key]["votes"],
                    "score_kind": "uncalibrated_cosine_similarity",
                }, separators=(",", ":")) + "\n")
        for row in rows:
            before = row["included"]
            self.gate.apply(row)
            self.suppressed += int(before and not row["included"])
            self.restored += int(not before and row["included"])

    def finish(self):
        self.sink.close()
        return {
            "source": "pretrained_semantic_roles", "name": "CLIP-ViT-B-32",
            "sha256": self.encoder.lock["sha256"], "license": "MIT",
            "prompts_sha256": PROMPTS_SHA256, "crop_transform": CROP_TRANSFORM,
            "annotations_used": False, "identity_status": "unconfirmed",
            "score_kind": "uncalibrated_cosine_similarity", "margin": self.gate.margin,
            "negative_samples": 2, "refresh_seconds": self.refresh_seconds,
            "ttl_seconds": self.gate.ttl, "inferred_crops": self.encoder.inferred_crops,
            "suppressed_observations": self.suppressed, "restored_observations": self.restored,
            "uncertain_policy": "preserve_floor_gate", "shorts_required": False,
        }
