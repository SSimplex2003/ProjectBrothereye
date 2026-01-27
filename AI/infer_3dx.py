import argparse
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn as nn

ROOT = Path(__file__).resolve().parents[1]

DEFAULT_WEIGHTS = ROOT / "AI" / "runs" / "x3d" / "best.pt"
DEFAULT_LABELS = ROOT / "actions_dataset" / "labels.txt"

CLIP_LEN_DEFAULT = 16
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def load_labels(path: Path):
    if path.exists():
        labels = [l.strip() for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]
        if labels:
            return labels
    return ["screwing", "place_part", "measure", "cutting"]


def build_model(num_classes: int):
    model = torch.hub.load("facebookresearch/pytorchvideo", "x3d_xs", pretrained=False)

    try:
        in_features = model.blocks[-1].proj.in_features
        model.blocks[-1].proj = nn.Linear(in_features, num_classes)
    except Exception:
        in_features = model.head.projection.in_features
        model.head.projection = nn.Linear(in_features, num_classes)

    return model


def preprocess(frames_bgr):
    frames_rgb = [cv2.cvtColor(f, cv2.COLOR_BGR2RGB) for f in frames_bgr]
    arr = np.stack(frames_rgb, axis=0).astype(np.float32) / 255.0

    T, H, W, _ = arr.shape
    target_short = 182
    scale = target_short / min(H, W)
    new_w, new_h = int(W * scale), int(H * scale)

    resized = np.stack([cv2.resize(arr[t], (new_w, new_h), interpolation=cv2.INTER_LINEAR) for t in range(T)], axis=0)

    crop = 160
    y0 = max(0, (new_h - crop) // 2)
    x0 = max(0, (new_w - crop) // 2)
    cropped = resized[:, y0:y0 + crop, x0:x0 + crop, :]

    x = torch.from_numpy(cropped).permute(3, 0, 1, 2).unsqueeze(0)
    mean = torch.tensor([0.45, 0.45, 0.45], device=DEVICE).view(1, 3, 1, 1, 1)
    std = torch.tensor([0.225, 0.225, 0.225], device=DEVICE).view(1, 3, 1, 1, 1)
    x = (x - mean) / std
    return x.to(DEVICE)


def read_frames(video_path: Path):
    cap = cv2.VideoCapture(str(video_path))
    frames = []
    ok = True
    while ok:
        ok, f = cap.read()
        if ok and f is not None:
            frames.append(f)
    cap.release()
    return frames


def pick_any_dataset_video():
    dataset_dir = ROOT / "actions_dataset"
    vids = []
    for class_dir in dataset_dir.iterdir():
        if class_dir.is_dir():
            vids += list(class_dir.glob("*.mp4"))
            vids += list(class_dir.glob("*.avi"))
            vids += list(class_dir.glob("*.mov"))
            vids += list(class_dir.glob("*.mkv"))
    return vids[0] if vids else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", default="", help="Path to video file")
    ap.add_argument("--weights", default=str(DEFAULT_WEIGHTS))
    ap.add_argument("--labels", default=str(DEFAULT_LABELS))
    ap.add_argument("--clip-len", type=int, default=CLIP_LEN_DEFAULT)
    ap.add_argument("--stride", type=int, default=8)
    args = ap.parse_args()

    if not args.video:
        v = pick_any_dataset_video()
        if v is None:
            raise FileNotFoundError(f"No videos found under: {ROOT / 'actions_dataset'}")
        args.video = str(v)
        print(f"[INFO] No --video provided. Using dataset video: {args.video}")

    video_path = Path(args.video)
    weights_path = Path(args.weights)
    labels_path = Path(args.labels)

    labels = load_labels(labels_path)
    model = build_model(len(labels)).to(DEVICE)

    if not weights_path.exists():
        raise FileNotFoundError(f"Missing weights: {weights_path}")

    ckpt = torch.load(weights_path, map_location=DEVICE)
    state = ckpt["model_state"] if isinstance(ckpt, dict) and "model_state" in ckpt else ckpt

    model.load_state_dict(state, strict=True)
    model.eval()

    frames = read_frames(video_path)
    if len(frames) < args.clip_len:
        print(f"Too short: need {args.clip_len} frames, got {len(frames)}")
        return

    best = None
    for start in range(0, len(frames) - args.clip_len + 1, args.stride):
        clip = frames[start:start + args.clip_len]
        x = preprocess(clip)

        with torch.no_grad():
            logits = model(x)
            probs = torch.softmax(logits, dim=1)[0]

        idx = int(torch.argmax(probs).item())
        prob = float(probs[idx].item())
        label = labels[idx] if idx < len(labels) else f"class_{idx}"

        if best is None or prob > best[0]:
            best = (prob, label, start)

    prob, label, start = best
    print(f"VIDEO: {video_path}")
    print(f"BEST : {label} prob={prob:.3f} at frame={start}")


if __name__ == "__main__":
    main()
