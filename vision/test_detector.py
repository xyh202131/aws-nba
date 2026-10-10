import unittest
import numpy as np
from detector import prepare_tensor, postprocess


class DetectorTests(unittest.TestCase):
    def test_fixed_letterbox_color_and_source_coordinates(self):
        image=np.full((720,1280,3),[10,20,30],dtype=np.uint8)
        tensor=prepare_tensor(image,(544,960))
        self.assertEqual(tensor.shape,(1,3,544,960))
        np.testing.assert_allclose(tensor[0,:,100,100],np.array([30,20,10])/255)
        raw=np.zeros((1,84,2),dtype=np.float32)
        raw[0,:4,0]=[150,302,150,300];raw[0,4,0]=.9
        raw[0,:4,1]=[600,302,150,300];raw[0,5,1]=.99
        boxes=postprocess(raw,(544,960),image.shape[:2])
        self.assertEqual(len(boxes),1,"Only measured person detections are accepted")
        np.testing.assert_allclose(boxes[0,:4],[100,200,300,600],atol=.01)

    def test_bad_shapes_and_nonfinite_outputs_fail(self):
        with self.assertRaises(ValueError):prepare_tensor(np.zeros((100,100,3),dtype=np.uint8),(543,960))
        with self.assertRaises(ValueError):postprocess(np.zeros((1,6,10)),(544,960),(720,1280))
        with self.assertRaises(ValueError):postprocess(np.full((1,84,10),np.nan,dtype=np.float32),(544,960),(720,1280))


if __name__=="__main__":unittest.main()
