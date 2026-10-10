"""Verify actual decoded rotation/SAR and VFR timestamps without model inference."""
import tempfile
import subprocess
from pathlib import Path
import unittest
import av
import cv2
import numpy as np
from core import normalize_display

ROOT=Path(__file__).resolve().parent.parent
FFMPEG=ROOT/"node_modules/ffmpeg-static/ffmpeg.exe"


@unittest.skipUnless(FFMPEG.exists(),"Windows bundled FFmpeg is required for this local integration test")
class DisplayTransformTests(unittest.TestCase):
    def ffmpeg(self, arguments, data=None):
        return subprocess.run([str(FFMPEG),"-hide_banner","-nostdin","-v","error",*arguments],input=data,check=True,capture_output=True,timeout=30).stdout

    def test_display_rotation_and_non_square_pixels_match_rendered_orientation(self):
        with tempfile.TemporaryDirectory(prefix="courtside-transform-test-") as folder:
            path=Path(folder);base=path/"source.mp4";rotated=path/"rotated.mp4"
            image=np.zeros((32,64,3),dtype=np.uint8)
            image[:16,:32]=[30,30,230];image[:16,32:]=[30,220,30]
            image[16:,:32]=[220,30,30];image[16:,32:]=[200,200,200]
            self.ffmpeg(["-f","rawvideo","-pix_fmt","bgr24","-s","64x32","-r","2","-i","pipe:0","-vf","setsar=2","-c:v","libx264","-pix_fmt","yuv420p","-y",str(base)],image.tobytes()*2)
            self.ffmpeg(["-display_rotation:v:0","90","-i",str(base),"-c","copy","-y",str(rotated)])
            with av.open(str(rotated)) as container:
                stream=container.streams.video[0];frame=next(container.decode(stream))
                normalized=normalize_display(frame.to_ndarray(format="bgr24"),float(stream.sample_aspect_ratio),int(frame.rotation))
                self.assertEqual(normalized.shape[:2],(128,32))
            raw=self.ffmpeg(["-i",str(rotated),"-vf","scale=iw*sar:ih,setsar=1,scale=32:128","-frames:v","1","-f","rawvideo","-pix_fmt","bgr24","pipe:1"])
            rendered=np.frombuffer(raw,dtype=np.uint8).reshape((128,32,3))
            self.assertLess(float(cv2.absdiff(normalized,rendered).mean()),8)

    def test_vfr_has_real_nonuniform_pts_and_frame_durations(self):
        with tempfile.TemporaryDirectory(prefix="courtside-vfr-test-") as folder:
            path=Path(folder)/"vfr.mp4"
            self.ffmpeg(["-f","lavfi","-i","testsrc2=size=64x32:rate=30:duration=1","-vf","select='lt(n,12)+not(mod(n,3))'","-fps_mode","vfr","-c:v","libx264","-y",str(path)])
            with av.open(str(path)) as container:
                frames=list(container.decode(video=0))
                stamps=[float(f.pts*f.time_base) for f in frames]
                durations=[float(f.duration*f.time_base) for f in frames]
                self.assertTrue(all(a<b for a,b in zip(stamps,stamps[1:])))
                self.assertGreater(len({round(b-a,6) for a,b in zip(stamps,stamps[1:])}),1)
                self.assertTrue(all(d>0 for d in durations))


if __name__=="__main__":unittest.main()
