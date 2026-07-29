import random
import shutil
import sys
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

sys.path.insert(0, str(Path(__file__).parents[1]))

ROOT     = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "actions_dataset"
CROP_DIR = DATA_DIR / "tool_crops"

VIDEO_EXTS     = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
SAMPLE_EVERY   = 5
CROP_SIZE      = 128
TRAIN_RATIO    = 0.85
MIN_CROPS_WARN = 30

WRIST_LEFT  = 9
WRIST_RIGHT = 10


def hand_crop(frame: np.ndarray,
              kxy: np.ndarray | None,
              kcon: np.ndarray | None,
              bbox: tuple) -> np.ndarray:
    H, W = frame.shape[:2]
    x1, y1, x2, y2 = bbox
    ph = max(1, y2 - y1)

    wpts = []
    if kxy is not None and kcon is not None:
        for idx in [WRIST_LEFT, WRIST_RIGHT]:
            if float(kcon[idx]) >= 0.30:
                wpts.append((float(kxy[idx][0]), float(kxy[idx][1])))

    if wpts:
        cx   = sum(p[0] for p in wpts) / len(wpts)
        cy   = sum(p[1] for p in wpts) / len(wpts)
        half = max(48, int(ph * 0.32))
    elif x2 > x1:
        cx, cy = (x1+x2)/2.0, y1 + ph*0.73
        half   = max(40, int(ph * 0.27))
    else:
        cx, cy = W*0.5, H*0.65
        half   = max(48, min(W, H)//3)

    c1x = max(0, int(cx-half));  c1y = max(0, int(cy-half))
    c2x = min(W, int(cx+half));  c2y = min(H, int(cy+half))
    if c2x <= c1x or c2y <= c1y:
        c1x, c1y, c2x, c2y = 0, 0, W, H

    return cv2.resize(frame[c1y:c2y, c1x:c2x],
                      (CROP_SIZE, CROP_SIZE),
                      interpolation=cv2.INTER_LINEAR)


def crops_from_video(video_path: Path, pose: YOLO) -> list[np.ndarray]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"    Cannot open: {video_path.name}")
        return []
    crops = []
    fn    = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if fn % SAMPLE_EVERY == 0:
            H, W = frame.shape[:2]
            kxy = kcon = None
            bbox = (0, 0, W, H)
            try:
                res  = pose.predict(frame, verbose=False, conf=0.25, classes=[0])
                r0   = res[0]
                if r0.boxes is not None and len(r0.boxes) > 0:
                    areas = [(b[2]-b[0])*(b[3]-b[1])
                             for b in r0.boxes.xyxy.cpu().numpy()]
                    best  = int(np.argmax(areas))
                    bb    = r0.boxes.xyxy.cpu().numpy()[best]
                    bbox  = tuple(int(v) for v in bb)
                    if r0.keypoints is not None:
                        kxy  = r0.keypoints.xy.cpu().numpy()[best]
                        kcon = (r0.keypoints.conf.cpu().numpy()[best]
                                if r0.keypoints.conf is not None else None)
            except Exception as exc:
                print(f"    Pose failed frame {fn}: {exc}")
            crops.append(hand_crop(frame, kxy, kcon, bbox))
        fn += 1
    cap.release()
    return crops


def save(crops: list[np.ndarray], cls: str, vid_idx: int, split: str) -> None:
    out = CROP_DIR / split / cls
    out.mkdir(parents=True, exist_ok=True)
    for i, crop in enumerate(crops):
        cv2.imwrite(str(out / f"v{vid_idx:03d}_{i:04d}.jpg"), crop)


def main() -> None:
    print("=" * 60)
    print("Tool Crop Extraction")
    print(f"Dataset : {DATA_DIR}")
    print(f"Output  : {CROP_DIR}")
    print("=" * 60)

    if CROP_DIR.exists():
        print("Clearing previous crops …")
        shutil.rmtree(CROP_DIR)

    pose = YOLO(str(ROOT / "yolov8n-pose.pt"))
    totals: dict[str, int] = {}

    for cls_dir in sorted(DATA_DIR.iterdir()):
        if not cls_dir.is_dir() or cls_dir.name in ("tool_crops", "action_crops"):
            continue
        videos = [p for p in cls_dir.iterdir() if p.suffix.lower() in VIDEO_EXTS]
        if not videos:
            print(f"\nSkipping '{cls_dir.name}' — no videos")
            continue

        print(f"\n── {cls_dir.name}  ({len(videos)} video(s))")
        cls_total = 0

        for vi, vp in enumerate(sorted(videos)):
            print(f"  {vp.name}")
            crops = crops_from_video(vp, pose)
            if not crops:
                print("    No crops extracted")
                continue
            random.shuffle(crops)
            n_tr = max(1, int(len(crops) * TRAIN_RATIO))
            save(crops[:n_tr],   cls_dir.name, vi, "train")
            save(crops[n_tr:],   cls_dir.name, vi, "val")
            print(f"    {n_tr} train  +  {len(crops)-n_tr} val")
            cls_total += len(crops)

        totals[cls_dir.name] = cls_total
        if cls_total < MIN_CROPS_WARN:
            print(f"  ⚠ Only {cls_total} crops — add more videos for better accuracy.")

    print("\n" + "=" * 60)
    print(f"Total crops: {sum(totals.values())}")
    for cls, n in totals.items():
        print(f"  {cls:20s}: {n}")
    print(f"\nNext → python training/train_classifier.py")
    print("=" * 60)


if __name__ == "__main__":
    main()
