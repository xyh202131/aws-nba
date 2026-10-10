import unittest
import tempfile
from pathlib import Path
import numpy as np
from role_filter import RoleGate, UniversalPlayerFilter
from semantic_roles import person_crop


def row(stamp=.4, segment="S001", included=True, reason=None):
    return {"segment_id": segment, "track_id": "T001", "pts_seconds": stamp,
            "status": "detected", "included": included, "exclusion_reason": reason,
            "bbox_xyxy_px": [1, 2, 20, 70], "player_id": None}


class RoleFilterTests(unittest.TestCase):
    def test_corroborated_referee_is_hidden_without_ever_reading_annotations(self):
        gate = RoleGate()
        gate.update(("S001", "T001"), 0, [.15, .35, .20])
        self.assertTrue(gate.apply(row(.1))["included"], "One model sample cannot establish a negative role")
        gate.update(("S001", "T001"), .33, [.16, .34, .18])
        result = gate.apply(row())
        self.assertFalse(result["included"])
        self.assertEqual(result["status"], "detected")
        self.assertEqual(result["bbox_xyxy_px"], [1, 2, 20, 70])
        self.assertIsNone(result["player_id"])

    def test_ambiguous_evidence_never_discards_a_player_and_clothing_is_not_a_gate(self):
        gate = RoleGate()
        for t in (0, .33):
            gate.update(("S001", "T001"), t, [.30, .31, .29])
        self.assertTrue(gate.apply(row())["included"])
        gate.update(("S001", "T001"), .4, [.4, .2, .15])
        self.assertTrue(gate.apply(row())["included"])

    def test_loss_scene_cut_and_stale_evidence_do_not_propagate_negative_roles(self):
        gate = RoleGate()
        for t in (0, .33):
            gate.update(("S001", "T001"), t, [.15, .35, .2])
        self.assertTrue(gate.apply(row(2))["included"])
        self.assertTrue(gate.apply(row(segment="S002"))["included"])
        lost = row(.5, included=False, reason="not_observed")
        lost["status"] = "lost"
        gate.apply(lost)
        self.assertTrue(gate.apply(row(.55))["included"])

    def test_confident_player_in_closeup_can_survive_missing_floor_but_not_bad_size(self):
        gate = RoleGate()
        gate.update(("S001", "T001"), 0, [.45, .2, .15])
        self.assertTrue(gate.apply(row(.1, included=False, reason="floor_region_unavailable"))["included"])
        self.assertFalse(gate.apply(row(.1, included=False, reason="person_too_small"))["included"])

    def test_corroboration_requires_distinct_source_samples_and_rejects_invalid_scores(self):
        gate = RoleGate()
        gate.update(("S001", "T001"), 0, [.15, .35, .20])
        with self.assertRaises(ValueError):gate.update(("S001", "T001"), 0, [.15, .35, .20])
        with self.assertRaises(ValueError):gate.update(("S001", "T001"), .33, [float("nan"), .35, .20])

    def test_runtime_cached_sample_is_not_a_second_vote_and_geometry_jump_resets_it(self):
        class Encoder:
            lock = {"sha256": "a"*64}
            inferred_crops = 0
            def score(self, _image, boxes):
                self.inferred_crops += len(boxes)
                return [[.1, .4, .2] for _ in boxes]
        with tempfile.TemporaryDirectory() as folder:
            encoder = Encoder()
            runtime = UniversalPlayerFilter(Path(folder)/"evidence.jsonl", encoder=encoder)
            def observe(stamp, box=None, status="detected"):
                r = {**row(stamp), "video_sha256":"b"*64}
                if box:r["bbox_xyxy_px"] = box
                r["status"] = status
                runtime.observe(None, [r], stamp, round(stamp*30))
                return r
            self.assertTrue(observe(0)["included"])
            self.assertTrue(observe(.1)["included"])
            self.assertEqual(encoder.inferred_crops, 1)
            self.assertFalse(observe(.34)["included"])
            self.assertTrue(observe(.4, [200, 2, 220, 70])["included"])
            observe(.41, status="lost")
            self.assertTrue(observe(.45)["included"])
            runtime.reset()
            self.assertTrue(observe(.5)["included"])
            evidence = runtime.finish()
            self.assertFalse(evidence["annotations_used"])
            self.assertFalse(evidence["shorts_required"])

    def test_full_body_crop_preserves_head_and_legs_instead_of_center_cutting(self):
        image = np.zeros((200, 100, 3), dtype=np.uint8)
        image[:20, 30:70] = [0, 0, 255]
        image[180:, 30:70] = [0, 255, 0]
        crop = np.asarray(person_crop(image, [30, 0, 70, 200]))
        self.assertEqual(crop.shape, (224, 224, 3))
        self.assertGreater(int(crop[5, 112, 0]), 240)
        self.assertGreater(int(crop[218, 112, 1]), 240)
        with self.assertRaises(ValueError):person_crop(image, [-1, 0, 70, 200])
        with self.assertRaises(ValueError):person_crop(image, [0, 0, 70, float("nan")])


if __name__ == "__main__":
    unittest.main()
