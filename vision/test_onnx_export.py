import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
from prepare_onnx import isolated_export


class ExportTests(unittest.TestCase):
    def test_other_candidates_and_original_pt_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/"yolo11m.pt";source.write_bytes(b"original-weights")
            other=source.with_suffix(".onnx");other.write_bytes(b"existing-960-candidate")
            destination=Path(folder)/"yolo11m-640x384.onnx"
            class Model:
                def __init__(self,path):self.source=Path(path)
                def export(self,**options):
                    self.path=self.source.with_suffix(".onnx");self.path.write_bytes(b"new-640-candidate");return self.path
            with patch("ultralytics.YOLO",Model):
                isolated_export(source,destination,(384,640))
                with self.assertRaises(ValueError):isolated_export(source,destination,(384,640))
            self.assertEqual(source.read_bytes(),b"original-weights")
            self.assertEqual(other.read_bytes(),b"existing-960-candidate")
            self.assertEqual(destination.read_bytes(),b"new-640-candidate")


if __name__=="__main__":unittest.main()
