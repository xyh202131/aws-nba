import copy
import unittest
from tracking_eval import build_eval_data,metric_results


def inputs(switch=False):
    frames=[{"frame_index":i,"time":i*.1,"width":100,"height":100,"segment_id":"S001","reviewed":True,
             "boxes":[{"id":"H001","bbox":[10,10,30,50],"visibility":"clear"}]} for i in range(50)]
    truth={"schemaVersion":"courtside.continuous-review.v1","videoSha256":"a"*64,"annotator":"synthetic-test-only",
           "annotationSource":"human_confirmed","predictionScope":"size_qualified_observations","frames":frames}
    rows=[{"frame_index":i,"pts_seconds":i*.1,"segment_id":"S001","track_id":"T002" if switch and i>=25 else "T001",
           "status":"detected","bbox_xyxy_px":[10,10,30,50],"detector_score":.9,"included":True} for i in range(50)]
    raw=[{"frame_index":i,"pts_seconds":i*.1,"width":100,"height":100} for i in range(50)]
    return truth,rows,raw


class TrackingEvaluationTests(unittest.TestCase):
    def test_pending_source_unreviewed_duplicate_ids_and_time_mismatch_refused(self):
        truth,rows,raw=inputs()
        for mutate in (lambda x:x.update(annotationSource="human_required"),
                       lambda x:x["frames"][0].update(reviewed=False),
                       lambda x:x["frames"][0]["boxes"].append(copy.deepcopy(x["frames"][0]["boxes"][0])),
                       lambda x:[f.update(boxes=[]) for f in x["frames"]],
                       lambda x:x["frames"][0].update(time=.05)):
            changed=copy.deepcopy(truth);mutate(changed)
            with self.assertRaises(ValueError):build_eval_data(changed,rows,raw,"a"*64)

    def test_trackeval_distinguishes_perfect_tracks_and_one_id_switch(self):
        perfect=metric_results(build_eval_data(*inputs(),"a"*64))
        switched=metric_results(build_eval_data(*inputs(True),"a"*64))
        self.assertAlmostEqual(perfect["HOTA"],1);self.assertAlmostEqual(perfect["IDF1"],1)
        self.assertEqual(perfect["ID_switches"],0)
        self.assertEqual(switched["ID_switches"],1);self.assertAlmostEqual(switched["IDF1"],.5)
        self.assertLess(switched["HOTA"],perfect["HOTA"])


if __name__=="__main__":unittest.main()
