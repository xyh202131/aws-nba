import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from quality import evaluate, iou
import hashlib


class QualityTests(unittest.TestCase):
    def inputs(self, root):
        frames = [{"frame_index":i,"time":i/30,"width":100,"height":100,"reviewed":True,
                   "boxes":[{"bbox":[0,0,10,10],"visibility":"clear"},{"bbox":[20,20,30,30],"visibility":"occluded"}]} for i in range(30)]
        annotation = {"schemaVersion":"courtside.tracking-review.v1","videoSha256":"a"*64,"annotator":"independent-test","annotationSource":"human_required","frames":frames}
        tracks = "".join(json.dumps({"frame_index":i,"status":"detected","included":True,"bbox_xyxy_px":b})+"\n" for i in range(30) for b in ([0,0,10,10],[20,20,30,30]))
        manifest = {"video_sha256":"a"*64,"width":100,"height":100,"duration":1,"files":{"tracks":{"sha256":hashlib.sha256(tracks.encode()).hexdigest()}}}
        for name, value in (("annotations.json",annotation),("manifest.json",manifest)):
            (root/name).write_text(json.dumps(value),encoding="utf8")
        (root/"tracks.jsonl").write_text(tracks,encoding="utf8",newline="\n")
        args = SimpleNamespace(annotations=str(root/"annotations.json"),manifest=str(root/"manifest.json"),tracks=str(root/"tracks.jsonl"),output=str(root/"report.json"))
        return args, annotation

    def test_occluded_match_is_separate_not_false_positive(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); args, _ = self.inputs(root)
            evaluate(args)
            report=json.loads(Path(args.output).read_text(encoding="utf8"))
            self.assertEqual(report["clearSample"]["precision"],1)
            self.assertEqual(report["occludedSample"]["matched"],30)
            self.assertEqual(report["occludedSample"]["recall"],1)

    def test_unreviewed_duplicate_out_of_bounds_and_source_mismatch_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);args, original=self.inputs(root)
            for kind in ("unreviewed","duplicate","bounds","visibility","source"):
                data=json.loads(json.dumps(original))
                if kind=="unreviewed":data["frames"][0]["reviewed"]=False
                if kind=="duplicate":data["frames"][1]["frame_index"]=0
                if kind=="bounds":data["frames"][0]["boxes"][0]["bbox"][2]=101
                if kind=="visibility":data["frames"][0]["boxes"][0]["visibility"]="invented"
                if kind=="source":data["videoSha256"]="b"*64
                Path(args.annotations).write_text(json.dumps(data),encoding="utf8")
                with self.subTest(kind=kind),self.assertRaises(ValueError):evaluate(args)

    def test_iou_geometry(self):
        self.assertEqual(iou([0,0,10,10],[0,0,10,10]),1)
        self.assertEqual(iou([0,0,10,10],[10,0,20,10]),0)
        self.assertAlmostEqual(iou([0,0,10,10],[5,0,15,10]),1/3)


if __name__=="__main__":unittest.main()
