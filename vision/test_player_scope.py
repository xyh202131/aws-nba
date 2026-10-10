import unittest
from player_scope import filter_player_rows


class PlayerScopeTests(unittest.TestCase):
    def test_positive_coarse_reference_overrides_clothing_and_unknowns_remain_auditable(self):
        rows=[{'segment_id':'S001','track_id':'T001','frame_index':1,'status':'detected','included':True,'exclusion_reason':None},
              {'segment_id':'S001','track_id':'T002','frame_index':1,'status':'detected','included':True,'exclusion_reason':None},
              {'segment_id':'S002','track_id':'T001','frame_index':2,'status':'detected','included':True,'exclusion_reason':None}]
        filtered,suppressed=filter_player_rows(rows,{('S001','T001'):[0]},{})
        self.assertTrue(filtered[0]['included'])
        self.assertFalse(filtered[1]['included']);self.assertFalse(filtered[2]['included'])
        self.assertEqual(filtered[1]['status'],'detected','Never erase actual detector observations')
        self.assertEqual(suppressed,2)

    def test_shorts_are_positive_only_with_court_support_and_cannot_reinclude_roi_rejections(self):
        rows=[{'segment_id':'S001','track_id':'T002','frame_index':i+1,'pts_seconds':i*.06,'status':'detected','included':True,'exclusion_reason':None} for i in range(3)]+[
              {'segment_id':'S001','track_id':'T003','frame_index':1,'status':'detected','included':False,'exclusion_reason':'outside_estimated_floor'}]
        cue={'court_support':.8,'bare_leg_ratio':.3,'gray_torso_ratio':.1,'bottom_cropped':False}
        filtered,n=filter_player_rows(rows,{('S001','other'):[0]},{(i+1,'S001','T002'):cue for i in range(3)})
        self.assertFalse(filtered[0]['included']);self.assertFalse(filtered[1]['included']);self.assertTrue(filtered[2]['included']);self.assertFalse(filtered[3]['included']);self.assertEqual(n,2)
        with self.assertRaises(ValueError):filter_player_rows(rows,{},{})

    def test_reference_does_not_label_an_entire_track_after_an_identity_switch(self):
        rows=[{'segment_id':'S001','track_id':'T001','frame_index':i,'pts_seconds':stamp,'status':'detected','included':True,'exclusion_reason':None}
              for i,stamp in enumerate([0,.5,.9,5])]
        filtered,n=filter_player_rows(rows,{('S001','T001'):[.5]},{})
        self.assertFalse(filtered[0]['included'],'A future player reference must not label an earlier referee')
        self.assertTrue(filtered[1]['included']);self.assertTrue(filtered[2]['included'])
        self.assertFalse(filtered[3]['included']);self.assertEqual(n,2)

    def test_wood_floor_inside_a_person_box_is_not_bare_leg_evidence(self):
        import numpy as np
        from player_filter import appearance_cues
        image=np.full((120,180,3),(130,170,210),dtype=np.uint8)
        cue=appearance_cues(image,[50,10,120,100])
        self.assertLess(cue['bare_leg_ratio'],.05,'A skin-like floor color must not admit a pants-wearing referee')

    def test_floor_color_uses_leg_sides_when_foot_is_over_a_different_paint_region(self):
        import numpy as np
        from player_filter import appearance_cues
        image=np.full((120,180,3),(130,170,210),dtype=np.uint8)
        image[95:108,:,:]=245
        cue=appearance_cues(image,[50,10,120,100])
        self.assertLess(cue['bare_leg_ratio'],.05,'The visible floor behind calves can differ from the foot patch')


if __name__=='__main__':unittest.main()
