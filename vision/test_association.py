import unittest
from pathlib import Path
from types import SimpleNamespace
import numpy as np
import yaml
from ultralytics.engine.results import Boxes
from ultralytics.trackers.bot_sort import BOTSORT
from appearance import AppearanceEncoder, attach_encoder
from track import create_tracker


class AssociationTests(unittest.TestCase):
    def test_bytetrack_uses_same_low_score_and_reset_contract(self):
        config=yaml.safe_load((Path(__file__).parent/"tracker.yaml").read_text(encoding="utf8"))
        config["tracker_type"]="bytetrack"
        tracker=create_tracker(config,appearance=False)
        self.assertEqual(type(tracker).__name__,"BYTETracker")
        image=np.zeros((720,1280,3),dtype=np.uint8)
        first=tracker.update(Boxes(np.array([[200,100,300,400,.9,0]],dtype=np.float32),image.shape[:2]).numpy(),image)
        second=tracker.update(Boxes(np.array([[202,100,302,400,.18,0]],dtype=np.float32),image.shape[:2]).numpy(),image)
        self.assertEqual(int(first[0][4]),int(second[0][4]))
        tracker.reset()
        self.assertEqual(tracker.frame_id,0)
        with self.assertRaises(ValueError):create_tracker(config,appearance=True)
        with self.assertRaises(ValueError):create_tracker({**config,"tracker_type":"unknown"},appearance=False)

    def test_reid_high_and_low_calls_retain_both_frame_pools(self):
        class Session:
            def run(self,outputs,inputs):
                return [np.ones((len(inputs["images"]),512),dtype=np.float32)]
        encoder=AppearanceEncoder.__new__(AppearanceEncoder)
        encoder.session=Session();encoder.input="images";encoder.output="features";encoder.size=16
        encoder.refresh_seconds=.25;encoder.stamp=0;encoder.inferred_crops=encoder.reused_crops=0
        encoder.reset()
        image=np.zeros((720,1280,3),dtype=np.uint8)
        high=np.array([[250,250,100,300]],dtype=np.float32)
        low=np.array([[550,250,100,300]],dtype=np.float32)
        encoder(image,high);encoder(image,low)
        encoder.stamp=.03
        encoder(image,high);encoder(image,low)
        self.assertEqual(encoder.inferred_crops,2)
        self.assertEqual(encoder.reused_crops,2)
        # A scene cut must clear both pools.
        encoder.reset();encoder.stamp=.06;encoder(image,high)
        self.assertEqual(encoder.inferred_crops,3)

    def test_external_encoder_receives_image_for_cached_detections(self):
        config=yaml.safe_load((Path(__file__).parent/"tracker.yaml").read_text(encoding="utf8"))
        config.update(gmc_method="none",with_reid=False)
        tracker=BOTSORT(SimpleNamespace(**config));tracker.reset()
        image=np.zeros((720,1280,3),dtype=np.uint8)
        calls=[]
        def encoder(actual_image,boxes):
            self.assertIs(actual_image,image)
            calls.append(len(boxes))
            return [np.ones(512,dtype=np.float32)/np.sqrt(512) for _ in boxes]
        attach_encoder(tracker,encoder)
        tracker.update(Boxes(np.array([[200,100,300,400,.9,0]],dtype=np.float32),image.shape[:2]).numpy(),image)
        self.assertEqual(calls,[1])

    def test_low_score_continuous_box_keeps_its_id(self):
        config=yaml.safe_load((Path(__file__).parent/"tracker.yaml").read_text(encoding="utf8"))
        config.update(gmc_method="none",with_reid=False)
        tracker=BOTSORT(SimpleNamespace(**config));tracker.reset()
        image=np.zeros((720,1280,3),dtype=np.uint8)
        first=tracker.update(Boxes(np.array([[200,100,300,400,.9,0]],dtype=np.float32),image.shape[:2]).numpy(),image)
        self.assertEqual(len(first),1)
        second=tracker.update(Boxes(np.array([[220,100,320,400,.27,0]],dtype=np.float32),image.shape[:2]).numpy(),image)
        self.assertEqual(len(second),1,"An actual low-score but overlapping observation should not disappear")
        self.assertEqual(int(second[0][4]),int(first[0][4]))


if __name__=="__main__":unittest.main()
