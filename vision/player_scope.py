"""Optional input-hash-bound coarse player references. No training or official identity claims."""
import json
import math
from pathlib import Path
from detections import digest
from appearance import box_iou


def filter_player_rows(rows,seeds,cues):
    if not seeds:raise ValueError("No usable player reference matched; refuse to suppress everyone")
    suppressed=0;history={}
    for row in rows:
        key=(row['segment_id'],row['track_id'])
        if not row['included']:
            history.pop(key,None);continue
        cue=cues.get((row['frame_index'],*key),{})
        # Shorts/bare calves are a positive hint, never a requirement for tights-wearing players.
        shorts=(cue.get('bare_leg_ratio',0)>=.20 and cue.get('court_support',0)>=.55
                and cue.get('gray_torso_ratio',1)<.45 and not cue.get('bottom_cropped',True))
        stamp=row.get('pts_seconds',0);prior=history.get(key)
        if shorts:
            if prior is None or stamp-prior['last']>.2:prior={'start':stamp,'count':0}
            prior['count']+=1;prior['last']=stamp;history[key]=prior
        else:history.pop(key,None)
        stable_shorts=bool(shorts and prior['count']>=3 and stamp-prior['start']>=.1)
        # Anonymous IDs can switch people. A reference is local in time, not an
        # unconditional role label for the entire trajectory or another scene.
        nearby_reference=any(abs(stamp-reference_time)<=.45 for reference_time in seeds.get(key,[]))
        if not nearby_reference and not stable_shorts:
            row['included']=False;row['exclusion_reason']='no_coarse_player_evidence';suppressed+=1
    return rows,suppressed


class CoarsePlayerScope:
    def __init__(self,path,video_hash):
        self.path=Path(path);self.sha256=digest(path);truth=json.loads(self.path.read_text(encoding='utf-8-sig'))
        if truth.get('schemaVersion')!='courtside.tracking-review.v1' or truth.get('videoSha256')!=video_hash:
            raise ValueError('Player reference source hash differs from video')
        if not 1<=len(truth.get('frames',[]))<=1000:raise ValueError('Player reference frame limit exceeded')
        self.frames={};self.seeds={};self.cues={};self.matched_frames=set()
        for frame in truth['frames']:
            index=frame.get('frame_index')
            if type(index) is not int or index<0 or index in self.frames or not isinstance(frame.get('boxes'),list) or len(frame['boxes'])>100:
                raise ValueError('Invalid player reference frame')
            self.frames[index]=frame
        self.reference_count=sum(len(f['boxes']) for f in self.frames.values())

    def observe(self,image,rows,stamp,index):
        import cv2
        from player_filter import appearance_cues
        frame=self.frames.get(index)
        if frame and (type(frame.get('time')) not in (int,float) or not math.isfinite(frame['time']) or abs(frame['time']-stamp)>1e-6
                      or frame.get('width')!=image.shape[1] or frame.get('height')!=image.shape[0]):
            raise ValueError('Player reference dimensions or PTS differ')
        hsv=cv2.cvtColor(image,cv2.COLOR_BGR2HSV)
        for row in rows:
            if row['status']!='detected':continue
            box=row['bbox_xyxy_px'];key=(row['segment_id'],row['track_id'])
            if row['included']:self.cues[(index,*key)]=appearance_cues(image,box,hsv)
            if not frame:continue
            for reference in frame['boxes']:
                b=reference.get('bbox')
                if not isinstance(b,list) or len(b)!=4 or not all(type(v) in (int,float) and math.isfinite(v) for v in b) or not (0<=b[0]<b[2]<=image.shape[1] and 0<=b[1]<b[3]<=image.shape[0]):
                    raise ValueError('Invalid coarse player box')
                intersection=max(0,min(box[2],b[2])-max(box[0],b[0]))*max(0,min(box[3],b[3])-max(box[1],b[1]))
                coverage=intersection/((b[2]-b[0])*(b[3]-b[1]))
                # Coarse references may cover only the visible torso. Tiny head boxes
                # cannot seed a role on their own, and the evidence stays provisional.
                if box_iou(box,b)>=.5 or (coverage>=.8 and box_iou(box,b)>=.15 and b[3]-b[1]>=image.shape[0]*.08):
                    self.seeds.setdefault(key,[]).append(stamp);self.matched_frames.add(index)

    def finalize(self,path):
        if digest(self.path)!=self.sha256:raise ValueError('Player references changed during the task')
        path=Path(path)
        with path.open(encoding='utf8') as source:rows=[json.loads(line) for line in source]
        filtered,suppressed=filter_player_rows(rows,self.seeds,self.cues)
        temporary=path.with_suffix('.player-scope.part')
        with temporary.open('x',encoding='utf8',newline='\n') as sink:
            for row in filtered:sink.write(json.dumps(row,ensure_ascii=False,separators=(',',':'))+'\n')
        temporary.replace(path)
        included=[r for r in filtered if r['included']]
        summary={'source':'user_provided_coarse_player_boxes','review_status':'provisional','annotations_sha256':self.sha256,
                 'reference_frames':len(self.frames),'reference_boxes':self.reference_count,'matched_reference_frames':len(self.matched_frames),
                 'seed_tracks':len(self.seeds),'suppressed_observations':suppressed,'shorts_policy':'positive_cue_not_required_3_observations_100ms',
                 'reference_policy':'same_segment_nearby_450ms','leg_policy':'skin_contrast_excludes_adjacent_court',
                 'unreferenced_policy':'hide_without_strong_shorts_and_court_evidence','identity_status':'unconfirmed'}
        return summary,len(included),len({(r['segment_id'],r['track_id']) for r in included}),len({r['frame_index'] for r in included})
