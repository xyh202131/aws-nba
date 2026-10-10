"""Image-plane geometry only; these rules do not infer identity or court metrics."""
import cv2


def normalize_display(image, sar, rotation):
    if not 0.1 <= sar <= 10 or rotation % 90 != 0:
        raise ValueError("Unsupported display transform")
    if abs(sar - 1) > 1e-6:
        image = cv2.resize(image, (round(image.shape[1] * sar), image.shape[0]))
    # FFmpeg display-matrix rotation and PyAV VideoFrame.rotation share a CCW angle.
    turns = round(rotation / 90) % 4
    if turns == 1:
        image = cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)
    elif turns == 2:
        image = cv2.rotate(image, cv2.ROTATE_180)
    elif turns == 3:
        image = cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
    return image


def scene_cut(previous, current, pixel_threshold, histogram_threshold):
    a = cv2.resize(previous, (128, 72))
    b = cv2.resize(current, (128, 72))
    diff = cv2.absdiff(a, b).mean() / 255
    hist_a = cv2.calcHist([a], [0, 1, 2], None, [8, 8, 8], [0, 256] * 3)
    hist_b = cv2.calcHist([b], [0, 1, 2], None, [8, 8, 8], [0, 256] * 3)
    cv2.normalize(hist_a, hist_a)
    cv2.normalize(hist_b, hist_b)
    distance = cv2.compareHist(hist_a, hist_b, cv2.HISTCMP_BHATTACHARYYA)
    return bool(diff >= pixel_threshold and distance >= histogram_threshold)


def include_person(box, width, height, min_height_ratio):
    x1, y1, x2, y2 = box
    if not (0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height):
        raise ValueError("Detector returned an invalid box")
    if y2 - y1 < min_height_ratio * height:
        return False, "below_min_height"
    return True, None


def floor_region(image, person_boxes=()):
    """An estimated light/wood-floor hull, not a calibrated court boundary."""
    small = cv2.resize(image, (320, 180))
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, (5, 18, 100), (40, 180, 255))
    mask = cv2.bitwise_or(mask, cv2.inRange(hsv, (0, 0, 140), (179, 42, 255)))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    # Neutral jerseys and seats must not connect the floor to the audience.
    for box in person_boxes:
        x1,y1,x2,y2 = box
        a,b = max(0,int(x1*320/image.shape[1])-1), max(0,int(y1*180/image.shape[0])-1)
        c,d = min(320,int(x2*320/image.shape[1])+2), min(180,int(y2*180/image.shape[0])+2)
        mask[b:d,a:c] = 0
    mask = cv2.morphologyEx(mask,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(3,3)))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = []
    for contour in contours:
        moments = cv2.moments(contour)
        if cv2.contourArea(contour) >= 320 * 180 * .005 and moments["m00"] and moments["m01"] / moments["m00"] >= 180 * .5:
            candidates.append(contour)
    if not candidates:
        return None
    import numpy as np
    hull = cv2.convexHull(np.concatenate(candidates)).astype("float32")
    hull[:, 0, 0] *= image.shape[1] / 320
    hull[:, 0, 1] *= image.shape[0] / 180
    return hull


def inside_floor(box, polygon, margin=0):
    if polygon is None:
        return False, "floor_region_unavailable"
    x1, _, x2, y2 = box
    distance = cv2.pointPolygonTest(polygon, ((float(x1)+float(x2))/2, float(y2)), True)
    if distance < 0:
        return False, "outside_estimated_floor"
    if distance < margin:
        return False, "near_estimated_floor_boundary"
    return True, None
