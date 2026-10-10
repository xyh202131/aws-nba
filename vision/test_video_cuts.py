"""Regression on the supplied videos: actual hard cuts, and an arena camera flash."""
import json
from pathlib import Path
import unittest
import av
import cv2
from core import scene_cut

ROOT=Path(__file__).resolve().parent.parent


class RealVideoCuts(unittest.TestCase):
    def test_real_cuts_reset_while_flash_does_not(self):
        profile=json.loads((ROOT/"vision/profile.json").read_text(encoding="utf8"))
        for name, expected in (("amen",[21.287933]),("flagg",[.066733])):
            cuts=[];previous=None
            with av.open(str(ROOT/f"public/media/{name}.mp4")) as container:
                for frame in container.decode(video=0):
                    image=cv2.resize(frame.to_ndarray(format="bgr24"),(128,72))
                    if previous is not None and scene_cut(previous,image,profile["cutPixelThreshold"],profile["cutHistogramThreshold"]):cuts.append(float(frame.pts*frame.time_base))
                    previous=image
            with self.subTest(video=name):
                self.assertEqual(len(cuts),len(expected))
                for actual,target in zip(cuts,expected):self.assertAlmostEqual(actual,target,places=4)
                self.assertFalse(any(16.48<t<16.58 for t in cuts),"camera flash is not a cut")


if __name__=="__main__":unittest.main()
