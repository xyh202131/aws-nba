"""Explicit experimental ONNX CPU inference; preprocessing and NMS shared by benchmarks."""
import numpy as np


def prepare_tensor(image,shape):
    from ultralytics.data.augment import LetterBox
    if len(shape)!=2 or any(type(v) is not int or not 32<=v<=1920 or v%32 for v in shape):
        raise ValueError("Invalid fixed detector shape")
    padded=LetterBox(new_shape=tuple(shape),auto=False,stride=32)(image=image)
    return np.ascontiguousarray(padded[...,::-1].transpose(2,0,1)[None],dtype=np.float32)/255


def postprocess(raw,shape,image_shape,confidence=.15):
    import torch
    from ultralytics.utils.nms import non_max_suppression
    from ultralytics.utils.ops import scale_boxes
    if raw.ndim!=3 or raw.shape[0]!=1 or raw.shape[1]!=84 or not np.isfinite(raw).all():
        raise ValueError("Invalid YOLO11 detection tensor")
    detected=non_max_suppression(torch.from_numpy(raw.copy()),conf_thres=confidence,iou_thres=.7,classes=[0],max_det=300)[0]
    if len(detected):detected[:,:4]=scale_boxes(shape,detected[:,:4],image_shape)
    return detected.cpu().numpy()[:,:6]


class OnnxDetector:
    def __init__(self,path,shape,threads=2):
        import onnxruntime as ort
        options=ort.SessionOptions();options.intra_op_num_threads=threads;options.inter_op_num_threads=1
        options.execution_mode=ort.ExecutionMode.ORT_SEQUENTIAL
        self.session=ort.InferenceSession(str(path),options,providers=["CPUExecutionProvider"])
        self.shape=tuple(shape)
        inputs=self.session.get_inputs();outputs=self.session.get_outputs()
        if len(inputs)!=1 or inputs[0].type!="tensor(float)" or inputs[0].shape!=[1,3,*shape] or len(outputs)!=1:
            raise ValueError("ONNX model is not the declared FP32 fixed-shape YOLO11 export")
        self.input=inputs[0].name;self.output=outputs[0].name

    def forward(self,tensor):
        if tensor.shape!=(1,3,*self.shape) or tensor.dtype!=np.float32 or not np.isfinite(tensor).all():
            raise ValueError("Detector tensor shape or values are invalid")
        return self.session.run([self.output],{self.input:tensor})[0]

    def predict(self,image,confidence):
        tensor=prepare_tensor(image,self.shape)
        return postprocess(self.forward(tensor),self.shape,image.shape[:2],confidence)
