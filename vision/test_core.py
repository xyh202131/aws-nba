"""No inference or AWS calls: the observable boundary rules for video tracking."""
import unittest
from core import scene_cut, include_person, normalize_display, floor_region, inside_floor
import numpy as np


class TrackingRules(unittest.TestCase):
    def test_cut_resets_but_small_motion_does_not(self):
        dark = np.zeros((72, 128, 3), dtype=np.uint8)
        white = np.full_like(dark, 255)
        self.assertTrue(scene_cut(dark, white, .38, .2))
        self.assertFalse(scene_cut(dark, dark.copy(), .38, .2))

    def test_small_people_are_excluded_without_calling_them_players(self):
        self.assertEqual(include_person([0, 0, 10, 20], 1280, 720, .09), (False, "below_min_height"))
        self.assertEqual(include_person([300, 200, 380, 400], 1280, 720, .09), (True, None))

    def test_rotation_and_sample_aspect_ratio_define_the_display_plane(self):
        image = np.zeros((4, 8, 3), dtype=np.uint8)
        self.assertEqual(normalize_display(image, 2, 0).shape[:2], (4, 16))
        self.assertEqual(normalize_display(image, 1, 90).shape[:2], (8, 4))
        with self.assertRaises(ValueError):
            normalize_display(image, 1, 13)

    def test_floor_filter_excludes_people_outside_the_estimated_play_area(self):
        image = np.zeros((180,320,3), dtype=np.uint8)
        image[70:175,10:310] = [150,185,210]
        hull = floor_region(image)
        self.assertIsNotNone(hull)
        self.assertEqual(inside_floor([100,80,140,150], hull), (True,None))
        self.assertEqual(inside_floor([100,0,140,30], hull), (False,"outside_estimated_floor"))
        self.assertEqual(inside_floor([100,0,140,30], None), (False,"floor_region_unavailable"))

    def test_neutral_light_courts_are_not_rejected_as_absent_floor(self):
        image = np.zeros((180,320,3), dtype=np.uint8)
        image[70:175,10:310] = [180,185,190]
        self.assertIsNotNone(floor_region(image))


if __name__ == "__main__":
    unittest.main()
