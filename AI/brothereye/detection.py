import math
from collections import deque
from typing import Optional, Tuple

import cv2
import numpy as np


SKELETON_EDGES = [
    (5, 6), (5, 7), (7, 9), (6, 8), (8, 10),
    (5, 11), (6, 12), (11, 12), (11, 13), (13, 15),
    (12, 14), (14, 16), (0, 5), (0, 6),
]


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def bbox_iou(a: tuple, b: tuple) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1 = max(ax1, bx1);  iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2);  iy2 = min(ay2, by2)
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    if inter == 0:
        return 0.0
    union = (ax2-ax1)*(ay2-ay1) + (bx2-bx1)*(by2-by1) - inter
    return inter / union if union > 0 else 0.0


def movement_speed(key, cx: float, cy: float, t: float, cache: dict) -> float:
    prev = cache.get(key)
    cache[key] = (cx, cy, t)
    if prev is None:
        return 0.0
    px, py, pt = prev
    return math.hypot(cx - px, cy - py) / max(1e-6, t - pt)


def _kp(kpts: Optional[list], idx: int):
    return kpts[idx] if (kpts and kpts[idx] is not None) else None


def head_direction(kpts: Optional[list]) -> str:
    nose, ls, rs = _kp(kpts, 0), _kp(kpts, 5), _kp(kpts, 6)
    if None in (nose, ls, rs):
        return "Unknown"
    dx = nose[0] - (ls[0] + rs[0]) / 2.0
    return "Right" if dx > 20 else ("Left" if dx < -20 else "Forward")


def hands_height(kpts: Optional[list]) -> str:
    ls, rs = _kp(kpts, 5), _kp(kpts, 6)
    lw, rw = _kp(kpts, 9), _kp(kpts, 10)
    lh, rh = _kp(kpts, 11), _kp(kpts, 12)
    if None in (ls, rs, lh, rh):
        return "Unknown"
    shoulder_y = (ls[1] + rs[1]) / 2.0
    hip_y      = (lh[1] + rh[1]) / 2.0
    wrists     = [p for p in (lw, rw) if p]
    if not wrists:
        return "NoWrist"
    wy = sum(p[1] for p in wrists) / len(wrists)
    if wy < shoulder_y - 10:   return "HandsUp"
    if wy <= hip_y + 10:       return "HandsMid"
    return "HandsLow"


def posture(kpts: Optional[list]) -> str:
    lh, rh = _kp(kpts, 11), _kp(kpts, 12)
    lk, rk = _kp(kpts, 13), _kp(kpts, 14)
    la, ra = _kp(kpts, 15), _kp(kpts, 16)
    if None in (lh, rh):
        return "Unknown"
    knees  = [p for p in (lk, rk) if p]
    ankles = [p for p in (la, ra) if p]
    if not knees or not ankles:
        return "Unknown"
    hy = (lh[1] + rh[1]) / 2.0
    ky = sum(p[1] for p in knees)  / len(knees)
    ay = sum(p[1] for p in ankles) / len(ankles)
    if abs(ky - hy) < 60:  return "SittingOrCrouch"
    if (ay - ky) > 60:     return "Standing"
    return "Leaning"


def fallback_label(h_dir: str, h_hands: str, h_posture: str,
                   speed: float, in_zone: bool) -> str:
    if speed > 90:                                                     return "moving"
    if not in_zone:                                                    return "break"
    if h_posture in ("SittingOrCrouch", "Leaning") \
       and h_hands in ("HandsMid", "HandsLow"):                       return "working"
    if h_dir in ("Left", "Right"):                                     return "working"
    return "working"


def extract_people(result) -> list[dict]:
    if result.boxes is None or len(result.boxes) == 0:
        return []
    ids      = result.boxes.id
    xyxy     = result.boxes.xyxy
    kp       = result.keypoints
    kxy_all  = kp.xy.cpu().numpy()   if kp is not None else None
    kcon_all = kp.conf.cpu().numpy() if kp is not None else None
    people   = []
    for i in range(len(xyxy)):
        tid = int(ids[i].item()) if ids is not None else -1
        box = xyxy[i].cpu().numpy().tolist()
        pts = None
        if kxy_all is not None:
            pts = [
                (float(kxy_all[i][j][0]), float(kxy_all[i][j][1]))
                if float(kcon_all[i][j]) >= 0.35 else None
                for j in range(17)
            ]
        people.append({"id": tid, "bbox": tuple(box), "kpts": pts})
    return people


def draw_skeleton(img, kpts: Optional[list]) -> None:
    for a, b in SKELETON_EDGES:
        pa, pb = _kp(kpts, a), _kp(kpts, b)
        if pa and pb:
            cv2.line(img,
                     (int(pa[0]), int(pa[1])),
                     (int(pb[0]), int(pb[1])),
                     (255, 0, 0), 2)
    if kpts:
        for p in kpts:
            if p:
                cv2.circle(img, (int(p[0]), int(p[1])), 3, (0, 255, 0), -1)


def feather_mask(mask_bool: np.ndarray, k: int = 9) -> np.ndarray:
    k = k | 1
    m = cv2.GaussianBlur((mask_bool.astype(np.uint8) * 255), (k, k), 0)
    return m > 128


def blur_by_mask(frame: np.ndarray, mask_bool: np.ndarray, k: int = 55) -> None:
    k = k | 1
    blurred = cv2.GaussianBlur(frame, (k, k), 0)
    frame[mask_bool] = blurred[mask_bool]


def blur_box(img: np.ndarray,
             x1: float, y1: float, x2: float, y2: float,
             k: int = 55) -> None:
    h, w = img.shape[:2]
    x1 = clamp(int(x1), 0, w - 1);  y1 = clamp(int(y1), 0, h - 1)
    x2 = clamp(int(x2), 0, w - 1);  y2 = clamp(int(y2), 0, h - 1)
    if x2 <= x1 or y2 <= y1:
        return
    k = k | 1
    img[y1:y2, x1:x2] = cv2.GaussianBlur(img[y1:y2, x1:x2], (k, k), 0)


class WristMotionTracker:
    """Sliding-window wrist-position tracker that outputs screwing motion features."""

    WINDOW     = 32
    MIN_FRAMES = 12

    def __init__(self):
        self._lw: deque = deque(maxlen=self.WINDOW)
        self._rw: deque = deque(maxlen=self.WINDOW)

    def update(self, kpts: Optional[list]) -> dict:
        self._lw.append(kpts[9]  if (kpts and len(kpts) > 9)  else None)
        self._rw.append(kpts[10] if (kpts and len(kpts) > 10) else None)
        return self._features()

    def _dominant_wrist(self) -> Optional[deque]:
        lv = sum(1 for p in self._lw if p is not None)
        rv = sum(1 for p in self._rw if p is not None)
        if lv == 0 and rv == 0:
            return None
        return self._lw if lv >= rv else self._rw

    def _features(self) -> dict:
        base = {"speed": 0.0, "reversal": 0.0, "compactness": 0.0,
                "arc": 0.0, "n": 0}
        buf = self._dominant_wrist()
        if buf is None:
            return base
        pts = [p for p in buf if p is not None]
        n   = len(pts)
        base["n"] = n
        if n < self.MIN_FRAMES:
            return base
        xs = np.array([p[0] for p in pts])
        ys = np.array([p[1] for p in pts])
        dx = np.diff(xs);  dy = np.diff(ys)
        dists = np.hypot(dx, dy)
        base["speed"]      = float(dists.mean())
        base["compactness"] = float(xs.std() + ys.std())
        if len(dx) >= 2:
            rx = int(np.sum(dx[:-1] * dx[1:] < 0))
            ry = int(np.sum(dy[:-1] * dy[1:] < 0))
            base["reversal"] = (rx + ry) / max(1, 2 * (len(dx) - 1))
        path = float(dists.sum())
        disp = math.hypot(float(xs[-1] - xs[0]), float(ys[-1] - ys[0]))
        base["arc"] = path / max(1.0, disp)
        return base


class ScrewingDetector:
    """Classifies wrist-motion features and fuses with an X3D prediction."""

    SPEED_IDLE   = 1.2
    SPEED_MOVE   = 20.0
    REV_THRESH   = 0.28
    COMPACT_MAX  = 38.0
    X3D_WEIGHT   = 0.60

    def classify(self, feats: dict,
                 hand_crop: Optional[np.ndarray] = None) -> Tuple[str, float]:
        n, spd   = feats["n"], feats["speed"]
        rev, cmp = feats["reversal"], feats["compactness"]
        arc      = feats["arc"]

        if n   < WristMotionTracker.MIN_FRAMES: return "working", 0.50
        if spd < self.SPEED_IDLE:              return "idle",    0.72
        if spd > self.SPEED_MOVE:              return "moving",  0.76

        if rev >= self.REV_THRESH and cmp <= self.COMPACT_MAX:
            conf = (0.50
                    + min(1.0, rev / 0.50)                          * 0.25
                    + max(0.0, 1.0 - cmp / self.COMPACT_MAX)        * 0.15
                    + min(1.0, (arc - 1.0) / 1.5)                   * 0.10)
            return "screwing", float(min(0.92, conf))

        if rev >= 0.14 and cmp <= self.COMPACT_MAX * 1.3:
            return "screwing", 0.55

        return "working", 0.58

    def fuse(self,
             m_label: str,           m_conf: float,
             x_label: Optional[str], x_conf: Optional[float]) -> Tuple[str, float]:
        if x_label is None:
            return m_label, m_conf
        w = self.X3D_WEIGHT
        if m_label == "screwing" and x_label == "screwing":
            return "screwing", min(0.97, (m_conf * (1 - w) + x_conf * w) * 1.08)
        if x_conf > 0.80:
            return x_label, x_conf
        if m_conf > 0.82:
            return m_label, m_conf
        if x_conf >= m_conf:
            return x_label, float(x_conf * w + m_conf * (1 - w))
        return m_label, float(m_conf * (1 - w) + x_conf * w)


class ToolClassifier:
    """Single-frame tool-in-hand classifier backed by a YOLOv8-cls model."""

    INPUT_SIZE = 128

    def __init__(self, model, device: str = "cpu"):
        self._model  = model
        self._device = device

    def predict(self, crop_bgr: np.ndarray) -> Tuple[str, float]:
        resized = cv2.resize(crop_bgr, (self.INPUT_SIZE, self.INPUT_SIZE))
        result  = self._model.predict(resized, verbose=False, device=self._device)
        if result and result[0].probs is not None:
            idx  = int(result[0].probs.top1)
            conf = float(result[0].probs.top1conf)
            return result[0].names[idx], conf
        return "unknown", 0.0
