"""Local pretrained ReID features for association; never NBA identity or world coordinates."""
import json
from pathlib import Path
import cv2
import numpy as np
from detections import digest

ROOT=Path(__file__).resolve().parents[1]


def attach_encoder(tracker, encoder):
    # Native model='auto' expects detector feature maps; our cached boxes carry none.
    # Construct the tracker without ReID first, then route the external encoder to BGR frames.
    tracker.args.with_reid = True
    tracker.args.model = "local-onnx-encoder"
    tracker.encoder = encoder


def box_iou(a,b):
    intersection=max(0,min(a[2],b[2])-max(a[0],b[0]))*max(0,min(a[3],b[3])-max(a[1],b[1]))
    union=(a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-intersection
    return intersection/union if union>0 else 0


class AppearanceEncoder:
    def __init__(self,threads=2,refresh_seconds=.25):
        import onnxruntime as ort
        lock=json.loads((ROOT/"vision/aux-model-lock.json").read_text(encoding="utf8"))["appearance"]
        path=ROOT/".local/vision-models"/lock["filename"]
        if digest(path)!=lock["sha256"]:raise ValueError("Appearance model hash mismatch")
        options=ort.SessionOptions();options.intra_op_num_threads=threads;options.inter_op_num_threads=1
        self.session=ort.InferenceSession(str(path),options,providers=["CPUExecutionProvider"])
        self.input=self.session.get_inputs()[0].name;self.output=self.session.get_outputs()[0].name
        self.size=448;self.lock=lock;self.stamp=0;self.refresh_seconds=refresh_seconds
        self.previous=[];self.inferred_crops=self.reused_crops=0

    def reset(self):self.previous=[]

    def __call__(self,image,detections):
        from ultralytics.trackers.utils.reid import ReID
        from ultralytics.utils.ops import xywh2xyxy
        boxes=xywh2xyxy(np.asarray(detections[:,:4])).tolist()
        crops=ReID._crop_detections(image,detections)
        features=[None]*len(boxes);times=[self.stamp]*len(boxes);used=set()
        for i,box in enumerate(boxes):
            candidates=[(box_iou(box,p["box"]),j) for j,p in enumerate(self.previous) if j not in used and 0<=self.stamp-p["time"]<self.refresh_seconds]
            if candidates:
                similarity,j=max(candidates)
                if similarity>=.75:
                    features[i]=self.previous[j]["feature"];times[i]=self.previous[j]["time"];used.add(j);self.reused_crops+=1
        missing=[i for i,f in enumerate(features) if f is None]
        for start in range(0,len(missing),8):
            indices=missing[start:start+8]
            # Published encoder preprocessing: BGR -> RGB, [0,1], bilinear square resize.
            batch=np.stack([cv2.resize(crops[i][...,::-1],(self.size,self.size),interpolation=cv2.INTER_LINEAR).transpose(2,0,1) for i in indices]).astype(np.float32)/255
            output=self.session.run([self.output],{self.input:batch})[0]
            if output.shape != (len(indices),512) or not np.isfinite(output).all() or (np.linalg.norm(output,axis=1)<1e-12).any():
                raise ValueError("Invalid appearance embeddings")
            output/=np.maximum(np.linalg.norm(output,axis=1,keepdims=True),1e-12)
            for i,feature in zip(indices,output):features[i]=feature;self.inferred_crops+=1
        self.previous=[{"box":box,"feature":feature,"time":stamp} for box,feature,stamp in zip(boxes,features,times)]
        return features
