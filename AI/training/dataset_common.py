"""Shared dataset building for the tool and action classifiers.

Fixes over the original per-script logic:
  * Train/val split is temporal per video (last VAL_FRACTION of each clip,
    with a GAP_SECONDS buffer) instead of random frames, so near-identical
    neighbouring frames no longer leak from train into val.
  * Each class is sampled with its own frame stride so classes end up with
    a similar number of crops regardless of how much video they have.
  * The train split is oversampled (file copies) up to the largest class so
    the classifier isn't biased towards the class with the most footage.
"""
import shutil
import sys
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np
from ultralytics import YOLO

sys.path.insert(0, str(Path(__file__).parents[1]))

ROOT     = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "actions_dataset"

VIDEO_EXTS       = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
SKIP_DIRS        = {"tool_crops", "action_crops"}
TARGET_PER_CLASS = 700     # sampled frames aimed for per class (before split)
MAX_STRIDE       = 15
VAL_FRACTION     = 0.20
GAP_SECONDS      = 1.0
MIN_CROPS_WARN   = 60

# crop_fn(frame, bbox_or_None, kxy_or_None, kcon_or_None) -> crop or None
CropFn = Callable[[np.ndarray, Optional[tuple], Optional[np.ndarray],
                   Optional[np.ndarray]], Optional[np.ndarray]]


def class_videos() -> dict:
    out = {}
    for cls_dir in sorted(DATA_DIR.iterdir()):
        if not cls_dir.is_dir() or cls_dir.name in SKIP_DIRS:
            continue
        vids = sorted(p for p in cls_dir.iterdir()
                      if p.suffix.lower() in VIDEO_EXTS)
        if vids:
            out[cls_dir.name] = vids
        else:
            print(f"Skipping '{cls_dir.name}' — no videos")
    return out


def _frame_info(path: Path) -> tuple:
    cap = cv2.VideoCapture(str(path))
    n   = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0) or 25.0
    cap.release()
    return n, fps


def _detect(pose: YOLO, frame: np.ndarray) -> tuple:
    """Largest person: (bbox, kxy, kcon) or (None, None, None)."""
    try:
        r0 = pose.predict(frame, verbose=False, conf=0.25, classes=[0])[0]
    except Exception as exc:
        print(f"    Pose failed: {exc}")
        return None, None, None
    if r0.boxes is None or len(r0.boxes) == 0:
        return None, None, None
    boxes = r0.boxes.xyxy.cpu().numpy()
    best  = int(np.argmax([(b[2]-b[0])*(b[3]-b[1]) for b in boxes]))
    bbox  = tuple(int(v) for v in boxes[best])
    kxy = kcon = None
    if r0.keypoints is not None:
        kxy = r0.keypoints.xy.cpu().numpy()[best]
        if r0.keypoints.conf is not None:
            kcon = r0.keypoints.conf.cpu().numpy()[best]
    return bbox, kxy, kcon


def build_dataset(out_dir: Path, crop_fn: CropFn, title: str) -> dict:
    print("=" * 60)
    print(title)
    print(f"Dataset : {DATA_DIR}")
    print(f"Output  : {out_dir}")
    print("=" * 60)

    if out_dir.exists():
        print("Clearing previous crops …")
        shutil.rmtree(out_dir)

    pose   = YOLO(str(ROOT / "yolov8n-pose.pt"))
    videos = class_videos()
    counts = {}

    for cls, vids in videos.items():
        infos  = {v: _frame_info(v) for v in vids}
        total  = sum(n for n, _ in infos.values())
        stride = int(min(MAX_STRIDE, max(1, round(total / TARGET_PER_CLASS))))
        print(f"\n── {cls}  ({len(vids)} video(s), {total} frames, stride {stride})")
        n_tr = n_vl = 0

        for vi, vp in enumerate(vids):
            n_frames, fps = infos[vp]
            val_start = int(n_frames * (1 - VAL_FRACTION))
            gap_start = max(0, val_start - int(GAP_SECONDS * fps))
            cap = cv2.VideoCapture(str(vp))
            fn = v_tr = v_vl = 0
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                if fn % stride == 0 and not (gap_start <= fn < val_start):
                    bbox, kxy, kcon = _detect(pose, frame)
                    crop = crop_fn(frame, bbox, kxy, kcon)
                    if crop is not None:
                        split = "val" if fn >= val_start else "train"
                        d = out_dir / split / cls
                        d.mkdir(parents=True, exist_ok=True)
                        cv2.imwrite(str(d / f"v{vi:03d}_{fn:06d}.jpg"), crop)
                        if split == "train":
                            v_tr += 1
                        else:
                            v_vl += 1
                fn += 1
            cap.release()
            note = "  (unreadable — no frames decoded)" if fn == 0 else ""
            print(f"  {vp.name[:70]}: {v_tr} train + {v_vl} val{note}")
            n_tr += v_tr
            n_vl += v_vl

        counts[cls] = (n_tr, n_vl)
        if n_tr + n_vl < MIN_CROPS_WARN:
            print(f"  ⚠ Only {n_tr + n_vl} crops — add more videos for this class.")

    _oversample(out_dir / "train", {c: n for c, (n, _) in counts.items()})

    print("\n" + "=" * 60)
    print("Crops per class (train before oversampling / val):")
    for cls, (tr, vl) in counts.items():
        print(f"  {cls:20s}: {tr:5d} train  {vl:4d} val")
    print("=" * 60)
    return counts


def _oversample(train_dir: Path, counts: dict) -> None:
    if not counts:
        return
    target = max(counts.values())
    for cls, n in counts.items():
        if n == 0 or n >= target:
            continue
        files = sorted((train_dir / cls).glob("*.jpg"))
        i = 0
        while n < target:
            src = files[i % len(files)]
            shutil.copy(src, src.with_name(f"{src.stem}_dup{i:05d}.jpg"))
            n += 1
            i += 1
        print(f"  oversampled {cls} → {target} train crops")
