"""Crop helpers shared by training and live inference.

The classifiers only work well if they see the same kind of crop at runtime
that they were trained on, so both the training scripts and the camera loop
must build crops through these functions.
"""
from typing import Optional, Sequence

import cv2
import numpy as np

HAND_CROP_SIZE   = 128
PERSON_CROP_SIZE = 192
PERSON_PAD_RATIO = 0.15
WRIST_CONF_MIN   = 0.35

WRIST_LEFT  = 9
WRIST_RIGHT = 10


def wrists_from_keypoints(kxy: Optional[np.ndarray],
                          kcon: Optional[np.ndarray]) -> list:
    """Wrist (x, y) points from raw YOLO pose arrays (17x2 xy, 17 conf)."""
    if kxy is None or kcon is None:
        return []
    return [(float(kxy[i][0]), float(kxy[i][1]))
            for i in (WRIST_LEFT, WRIST_RIGHT)
            if float(kcon[i]) >= WRIST_CONF_MIN]


def wrists_from_kpts(kpts: Optional[Sequence]) -> list:
    """Wrist (x, y) points from extract_people()'s kpts list (None = low conf)."""
    if not kpts:
        return []
    return [kpts[i] for i in (WRIST_LEFT, WRIST_RIGHT)
            if i < len(kpts) and kpts[i] is not None]


def hand_crop(frame: np.ndarray, wrists: list,
              bbox: Optional[tuple]) -> np.ndarray:
    """Square crop around the hands, resized to HAND_CROP_SIZE.

    Centred on the visible wrists; falls back to the lower part of the person
    box, then to the lower-centre of the frame when no person was found.
    """
    H, W = frame.shape[:2]
    if bbox is not None and bbox[2] > bbox[0] and bbox[3] > bbox[1]:
        x1, y1, x2, y2 = bbox
        ph = max(1, y2 - y1)
    else:
        x1 = y1 = x2 = y2 = 0
        ph = 0

    if wrists and ph:
        cx   = sum(p[0] for p in wrists) / len(wrists)
        cy   = sum(p[1] for p in wrists) / len(wrists)
        half = max(48, int(ph * 0.32))
    elif ph:
        cx, cy = (x1 + x2) / 2.0, y1 + ph * 0.73
        half   = max(40, int(ph * 0.27))
    else:
        cx, cy = W * 0.5, H * 0.65
        half   = max(48, min(W, H) // 3)

    c1x = max(0, int(cx - half));  c1y = max(0, int(cy - half))
    c2x = min(W, int(cx + half));  c2y = min(H, int(cy + half))
    if c2x <= c1x or c2y <= c1y:
        c1x, c1y, c2x, c2y = 0, 0, W, H
    return cv2.resize(frame[c1y:c2y, c1x:c2x],
                      (HAND_CROP_SIZE, HAND_CROP_SIZE),
                      interpolation=cv2.INTER_LINEAR)


def person_crop(frame: np.ndarray, bbox: tuple) -> np.ndarray:
    """Padded crop of the whole person, resized to PERSON_CROP_SIZE."""
    H, W = frame.shape[:2]
    x1, y1, x2, y2 = bbox
    if x2 <= x1 or y2 <= y1:
        x1, y1, x2, y2 = 0, 0, W, H
    px = (x2 - x1) * PERSON_PAD_RATIO
    py = (y2 - y1) * PERSON_PAD_RATIO
    c1x = max(0, int(x1 - px));  c1y = max(0, int(y1 - py))
    c2x = min(W, int(x2 + px));  c2y = min(H, int(y2 + py))
    if c2x <= c1x or c2y <= c1y:
        c1x, c1y, c2x, c2y = 0, 0, W, H
    return cv2.resize(frame[c1y:c2y, c1x:c2x],
                      (PERSON_CROP_SIZE, PERSON_CROP_SIZE),
                      interpolation=cv2.INTER_LINEAR)
