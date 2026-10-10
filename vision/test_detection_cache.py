import json
from pathlib import Path
import tempfile
import unittest
import numpy as np
from detections import DetectionCache, detection_fingerprint


class CacheTests(unittest.TestCase):
    def test_backend_and_input_shape_never_share_cached_detections(self):
        profile={"imageSize":960,"confidence":.15,"maxFps":60}
        original=detection_fingerprint("a"*64,"b"*64,5,profile,{})
        explicit=detection_fingerprint("a"*64,"b"*64,5,{**profile,"inferenceBackend":"torch"},{})
        self.assertEqual(original,explicit,"Keep existing Torch cache provenance unchanged")
        onnx=detection_fingerprint("a"*64,"b"*64,5,{**profile,"inferenceBackend":"onnx","inputShape":[544,960]}, {})
        self.assertNotEqual(original,onnx)
        self.assertNotEqual(onnx,detection_fingerprint("a"*64,"b"*64,5,{**profile,"inferenceBackend":"onnx","inputShape":[960,960]}, {}))
        with self.assertRaises(ValueError):detection_fingerprint("a"*64,"b"*64,5,{**profile,"inferenceBackend":"unknown"},{})

    def test_reuse_measured_boxes_without_detector_and_keep_parameter_scope(self):
        with tempfile.TemporaryDirectory(prefix="courtside-cache-test-") as directory:
            fingerprint={"video":"a"*64,"weights":"b"*64,"image_size":960}
            cache=DetectionCache(directory,fingerprint)
            expected=np.array([[1,2,30,40,.9,0]],dtype=np.float32)
            np.testing.assert_equal(cache.get(2,.04,100,100,lambda:expected),expected)
            before=cache.finish();cache.close()
            cached=DetectionCache(directory,fingerprint)
            def forbidden():raise AssertionError("Cached observations must not run the detector again")
            np.testing.assert_equal(cached.get(2,.04,100,100,forbidden),expected)
            self.assertEqual(cached.finish()["sha256"],before["sha256"])
            other=DetectionCache(directory,{**fingerprint,"image_size":640})
            self.assertEqual(other.state,"miss");other.close()

    def test_corruption_incomplete_coverage_and_decoded_frame_mismatch_stop(self):
        with tempfile.TemporaryDirectory(prefix="courtside-cache-test-") as directory:
            cache=DetectionCache(directory,{"video":"a"*64})
            cache.get(1,.1,100,100,lambda:np.array([[1,2,30,40,.8,0]]));cache.finish();cache.close()
            cached=DetectionCache(directory,{"video":"a"*64})
            with self.assertRaises(ValueError):cached.get(2,.2,100,100,lambda:None)
            cached.close()
            cached=DetectionCache(directory,{"video":"a"*64})
            with self.assertRaises(ValueError):cached.finish()
            cached.close()
            cache.path.write_text("corrupt",encoding="utf8")
            with self.assertRaises(ValueError):DetectionCache(directory,{"video":"a"*64})


if __name__=="__main__":unittest.main()
