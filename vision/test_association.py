import unittest
from pathlib import Path
from types import SimpleNamespace
import numpy as np
import yaml
from ultralytics.engine.results import Boxes
from ultralytics.trackers.bot_sort import BOTSORT
from appearance import attach_encoder


class AssociationTests(unittest.TestCase):
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
