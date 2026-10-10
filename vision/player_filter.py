"""Conservative visual role cues for player overlays, not verified NBA identity."""
import cv2
import numpy as np


def appearance_cues(image,box,hsv=None):
    height,width=image.shape[:2];x1,y1,x2,y2=box
    x1,y1,x2,y2=map(int,(max(0,x1),max(0,y1),min(width,x2),min(height,y2)))
    w,h=x2-x1,y2-y1
    if w<4 or h<8:raise ValueError("Person crop too small")
    if hsv is None:hsv=cv2.cvtColor(image,cv2.COLOR_BGR2HSV)
    # Side patches adjacent to the measured foot; no inference of metric court coordinates.
    dx=max(8,min(40,round(w*.3)));dy=max(4,min(12,round(height*.015)))
    patch_bounds=[(max(0,y2-dy),min(height,y2+dy),max(0,x1-dx),max(0,x1)),
                  (max(0,y2-dy),min(height,y2+dy),min(width,x2),min(width,x2+dx)),
                  (y1+round(h*.6),y1+round(h*.9),max(0,x1-dx),max(0,x1)),
                  (y1+round(h*.6),y1+round(h*.9),min(width,x2),min(width,x2+dx))]
    surfaces=[];court_colors=[]
    for patch_index,(ya,yb,xa,xb) in enumerate(patch_bounds):
        p=hsv[ya:yb,xa:xb]
        if not p.size:continue
        warm=(p[:,:,0]>=5)&(p[:,:,0]<=40)&(p[:,:,1]>=18)&(p[:,:,1]<=180)&(p[:,:,2]>=100)
        light=(p[:,:,1]<=42)&(p[:,:,2]>=140)
        # Ground support is measured at the foot only. Calf-side patches
        # estimate background color when feet cross paint/wood boundaries.
        if patch_index<2:surfaces.append(float(np.mean(warm|light)))
        if np.count_nonzero(warm|light)>=30:
            lab=cv2.cvtColor(image[ya:yb,xa:xb],cv2.COLOR_BGR2Lab)
            court_colors.append(np.median(lab[warm|light],axis=0))
    torso=hsv[y1+round(h*.18):y1+round(h*.45),x1+round(w*.2):x1+round(w*.8)]
    gray=(torso[:,:,1]<=55)&(torso[:,:,2]>=75)&(torso[:,:,2]<=185)
    legs=image[y1+round(h*.6):y1+round(h*.9),x1+round(w*.2):x1+round(w*.8)]
    ycrcb=cv2.cvtColor(legs,cv2.COLOR_BGR2YCrCb);leg_hsv=cv2.cvtColor(legs,cv2.COLOR_BGR2HSV)
    # A weak shorts/bare-leg cue only. Tights, socks and darker skin can reduce it.
    skin=(ycrcb[:,:,1]>=133)&(ycrcb[:,:,1]<=185)&(ycrcb[:,:,2]>=77)&(ycrcb[:,:,2]<=135)&(leg_hsv[:,:,1]>=30)&(leg_hsv[:,:,2]>=45)
    # Loose person boxes contain visible floor. Court-colored pixels cannot
    # supply the bare-leg hint; otherwise black pants over wood look like shorts.
    if court_colors:
        lab=cv2.cvtColor(legs,cv2.COLOR_BGR2Lab).astype(float)
        for color in court_colors:
            similar=(np.abs(lab[:,:,0]-color[0])<20)&(np.linalg.norm(lab[:,:,1:]-color[1:],axis=2)<12)
            skin &= ~similar
    return {"court_support":max(surfaces,default=0),"gray_torso_ratio":float(np.mean(gray)),"bare_leg_ratio":float(np.mean(skin)),"bottom_cropped":y2>=height-2}
