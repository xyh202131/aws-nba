"""Content-addressed cache of actual detector observations, independent of tracking options."""
import hashlib
import json
import math
from pathlib import Path
import uuid
import numpy as np


def digest(path):
    value=hashlib.sha256()
    with Path(path).open("rb") as source:
        for chunk in iter(lambda:source.read(1024*1024),b""):value.update(chunk)
    return value.hexdigest()


def detection_fingerprint(video_hash,weights_hash,duration,profile,versions):
    return {"schema_version":"courtside.detection-cache.v1","video_sha256":video_hash,
            "weights_sha256":weights_hash,"duration":duration,"image_size":profile["imageSize"],
            "confidence":profile["confidence"],"max_fps":profile["maxFps"],"classes":[0],
            "display_version":"sar-rotation-v1","sampling_version":"pts-greedy-v1","dependencies":versions}


class DetectionCache:
    def __init__(self,folder,fingerprint):
        self.folder=Path(folder);self.folder.mkdir(parents=True,exist_ok=True)
        self.fingerprint=fingerprint
        self.key=hashlib.sha256(json.dumps(fingerprint,sort_keys=True,separators=(",",":")).encode()).hexdigest()
        self.metadata_path=self.folder/(self.key+".json")
        self.frames=self.count=0;self.reader=self.writer=None;self.state="miss"
        self.sha256=None;self.bytes=0
        if self.metadata_path.exists():
            metadata=json.loads(self.metadata_path.read_text(encoding="utf8"))
            sha=metadata.get("sha256","")
            if metadata.get("fingerprint")!=fingerprint or metadata.get("complete") is not True or len(sha)!=64 or any(c not in "0123456789abcdef" for c in sha):raise ValueError("Detection cache metadata is invalid")
            self.path=self.folder/(self.key+"-"+sha+".jsonl")
            if self.path.stat().st_size!=metadata["bytes"] or not 0<metadata["bytes"]<=100_000_000 or digest(self.path)!=sha:raise ValueError("Detection cache hash or size mismatch")
            if type(metadata.get("frames")) is not int or not 0<metadata["frames"]<=60000 or type(metadata.get("detections")) is not int or not 0<=metadata["detections"]<=150000:raise ValueError("Detection cache counts are invalid")
            self.sha256=sha;self.bytes=metadata["bytes"];self.expected_frames=metadata["frames"];self.expected_detections=metadata["detections"]
            self.reader=self.path.open(encoding="utf8");self.state="hit"
        else:
            self.path=self.folder/(self.key+"-"+str(uuid.uuid4())+".part")
            self.writer=self.path.open("x",encoding="utf8",newline="\n")

    def get(self,index,stamp,width,height,detector):
        if self.reader:
            line=self.reader.readline(1_000_001)
            if not line or len(line)>1_000_000:raise ValueError("Detection cache frame missing or oversized")
            row=json.loads(line)
            cache_stamp=row.get("pts_seconds")
            if not isinstance(cache_stamp,(float,int)) or not math.isfinite(cache_stamp) or row.get("frame_index")!=index or abs(cache_stamp-stamp)>1e-6 or row.get("width")!=width or row.get("height")!=height:raise ValueError("Detection cache frame does not match decoded source")
            boxes=np.asarray(row.get("boxes"),dtype=np.float32).reshape((-1,6))
        else:
            boxes=np.asarray(detector(),dtype=np.float32).reshape((-1,6))
            row={"frame_index":index,"pts_seconds":stamp,"width":width,"height":height,"boxes":boxes.tolist()}
        if len(boxes)>1000 or not np.isfinite(boxes).all() or (len(boxes) and not (
                (boxes[:,0]>=0).all() and (boxes[:,1]>=0).all() and (boxes[:,2]<=width).all() and (boxes[:,3]<=height).all()
                and (boxes[:,2]>boxes[:,0]).all() and (boxes[:,3]>boxes[:,1]).all()
                and (boxes[:,4]>=0).all() and (boxes[:,4]<=1).all() and (boxes[:,5]==0).all())):
            raise ValueError("Detection cache contains invalid measured boxes")
        self.frames+=1;self.count+=len(boxes)
        if self.frames>60000 or self.count>150000:raise ValueError("Detection cache limits exceeded")
        if self.writer:
            self.writer.write(json.dumps(row,separators=(",",":"))+"\n")
            if self.writer.tell()>100_000_000:raise ValueError("Detection cache size exceeded")
        return boxes

    def finish(self):
        if self.reader:
            if self.reader.readline() or self.frames!=self.expected_frames or self.count!=self.expected_detections:raise ValueError("Detection cache coverage mismatch")
            self.reader.close();self.reader=None
        else:
            self.writer.close();self.writer=None
            if not self.frames:raise ValueError("Empty detection cache")
            self.sha256=digest(self.path);self.bytes=self.path.stat().st_size
            destination=self.folder/(self.key+"-"+self.sha256+".jsonl")
            self.path.replace(destination);self.path=destination
            metadata={"fingerprint":self.fingerprint,"complete":True,"frames":self.frames,"detections":self.count,"sha256":self.sha256,"bytes":self.bytes}
            temporary=self.folder/(self.key+"-"+str(uuid.uuid4())+".json.part")
            temporary.write_text(json.dumps(metadata),encoding="utf8");temporary.replace(self.metadata_path)
        return {"state":self.state,"key":self.key,"sha256":self.sha256,"bytes":self.bytes,"frames":self.frames,"detections":self.count}

    def close(self):
        for stream in (self.reader,self.writer):
            if stream:stream.close()


def measured_box_array(result):
    """Six columns from YOLO person-only inference; tracker predictions are never cached."""
    return result.boxes.data.cpu().numpy()[:,:6]
