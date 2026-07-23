import random
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.optim.lr_scheduler import CosineAnnealingLR

sys.path.insert(0, str(Path(__file__).parents[1]))

ROOT     = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "actions_dataset"
RUN_DIR  = ROOT / "AI" / "runs" / "x3d"
RUN_DIR.mkdir(parents=True, exist_ok=True)

VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}

EPOCHS            = 20
LR                = 3e-4
BATCH_SIZE        = 4
CLIP_LEN          = 16
IMG_SIZE          = 160
CLIPS_PER_VIDEO   = 3
MIN_VIDEOS_PER_CLASS = 1
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

_frame_cache: dict[str, list] = {}


def discover(data_dir: Path) -> tuple[list[str], dict[str, list[Path]]]:
    names: list[str] = []
    videos: dict[str, list[Path]] = {}
    for folder in sorted(data_dir.iterdir()):
        if not folder.is_dir():
            continue
        cls  = folder.name
        vids = [p for p in folder.iterdir() if p.suffix.lower() in VIDEO_EXTS]
        if len(vids) < MIN_VIDEOS_PER_CLASS:
            print(f"  skip '{cls}' ({len(vids)} videos)")
            continue
        names.append(cls)
        videos[cls] = vids
        print(f"  ok   '{cls}' ({len(vids)} videos)")
    return names, videos


def load_frames(path: Path) -> list:
    cap    = cv2.VideoCapture(str(path))
    frames = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(f)
    cap.release()
    return frames


def augment(clip: np.ndarray, flip: bool,
            bright: float, contrast: float, sat: float) -> np.ndarray:
    clip = np.clip(clip * contrast + bright, 0.0, 1.0)
    out  = []
    for t in range(clip.shape[0]):
        f   = (clip[t] * 255).astype(np.uint8)
        hsv = cv2.cvtColor(f, cv2.COLOR_RGB2HSV).astype(np.float32)
        hsv[:, :, 1] = np.clip(hsv[:, :, 1] * sat, 0, 255)
        out.append(cv2.cvtColor(hsv.astype(np.uint8),
                                cv2.COLOR_HSV2RGB).astype(np.float32) / 255.0)
    clip = np.stack(out)
    if flip:
        clip = clip[:, :, ::-1, :].copy()
    return clip


def sample_tensor(frames: list, do_augment: bool = False):
    if len(frames) < CLIP_LEN:
        return None
    if do_augment and len(frames) >= CLIP_LEN * 2:
        span  = random.randint(CLIP_LEN, min(len(frames), CLIP_LEN * 2))
        start = random.randint(0, len(frames) - span)
        idx   = sorted(random.sample(range(start, start+span), CLIP_LEN))
    else:
        start = random.randint(0, len(frames) - CLIP_LEN)
        idx   = list(range(start, start + CLIP_LEN))

    clip = np.stack([cv2.cvtColor(frames[i], cv2.COLOR_BGR2RGB)
                     for i in idx]).astype(np.float32) / 255.0

    if do_augment:
        clip = augment(clip,
                       flip     = random.random() < 0.5,
                       bright   = random.uniform(-0.08,  0.08),
                       contrast = random.uniform( 0.85,  1.15),
                       sat      = random.uniform( 0.80,  1.20))

    T, H, W, _ = clip.shape
    scale = 182 / min(H, W)
    nw, nh = int(W*scale), int(H*scale)
    resized = np.stack([cv2.resize(clip[t], (nw, nh)) for t in range(T)])
    y0 = max(0, (nh-IMG_SIZE)//2)
    x0 = max(0, (nw-IMG_SIZE)//2)
    crop = resized[:, y0:y0+IMG_SIZE, x0:x0+IMG_SIZE, :]

    x    = torch.from_numpy(crop).permute(3, 0, 1, 2)
    mean = torch.tensor([0.45, 0.45, 0.45]).view(3, 1, 1, 1)
    std  = torch.tensor([0.225, 0.225, 0.225]).view(3, 1, 1, 1)
    return ((x - mean) / std).unsqueeze(0)


def make_batch(samples: list, do_augment: bool = True):
    xs, ys = [], []
    n_clips = CLIPS_PER_VIDEO if do_augment else 1
    for path, y in samples:
        key = str(path)
        if key not in _frame_cache:
            _frame_cache[key] = load_frames(path)
        for _ in range(n_clips):
            t = sample_tensor(_frame_cache[key], do_augment)
            if t is not None:
                xs.append(t); ys.append(y)
    if not xs:
        return None, None
    return torch.cat(xs), torch.tensor(ys, dtype=torch.long)


def build_model(n: int) -> nn.Module:
    model = torch.hub.load(
        "facebookresearch/pytorchvideo", "x3d_xs", pretrained=True)
    try:
        in_f = model.blocks[-1].proj.in_features
        model.blocks[-1].proj = nn.Linear(in_f, n)
    except Exception:
        in_f = model.head.projection.in_features
        model.head.projection = nn.Linear(in_f, n)
    return model


def validate(model: nn.Module, items: list, classnames: list) -> tuple[float, dict]:
    model.eval()
    correct: dict[int, int] = {i: 0 for i in range(len(classnames))}
    total:   dict[int, int] = {i: 0 for i in range(len(classnames))}
    with torch.no_grad():
        for i in range(0, len(items), BATCH_SIZE):
            X, Y = make_batch(items[i:i+BATCH_SIZE], do_augment=False)
            if X is None: continue
            X, Y = X.to(DEVICE), Y.to(DEVICE)
            pred = torch.argmax(model(X), dim=1)
            for p, gt in zip(pred.cpu().tolist(), Y.cpu().tolist()):
                total[gt] += 1
                if p == gt: correct[gt] += 1
    model.train()
    overall  = sum(correct.values()) / max(1, sum(total.values()))
    per_cls  = {classnames[i]: round(correct[i]/total[i], 3) if total[i] else None
                for i in range(len(classnames))}
    return overall, per_cls


def class_weights(classnames: list, videos: dict) -> torch.Tensor:
    counts = torch.tensor([float(len(videos[c])) for c in classnames])
    inv    = 1.0 / counts
    return inv / inv.sum() * len(classnames)


def oversample(items: list, n_classes: int) -> list:
    buckets: dict[int, list] = {i: [] for i in range(n_classes)}
    for item in items:
        buckets[item[1]].append(item)
    max_n = max(len(v) for v in buckets.values())
    out   = []
    for vids in buckets.values():
        extended = vids * ((max_n // len(vids)) + 1)
        out.extend(extended[:max_n])
    random.shuffle(out)
    return out


def main() -> None:
    print("=" * 60)
    print(f"X3D Training   device={DEVICE}")
    print(f"Data : {DATA_DIR}")
    print("=" * 60)

    classnames, videos = discover(DATA_DIR)
    if len(classnames) < 2:
        print("Need at least 2 classes with videos.")
        return

    print(f"\nClasses: {classnames}")
    (DATA_DIR / "labels.txt").write_text(
        "\n".join(classnames) + "\n", encoding="utf-8")

    all_items: list[tuple[Path, int]] = []
    train_items, val_items = [], []
    for i, cls in enumerate(classnames):
        vids = [(p, i) for p in videos[cls]]
        random.shuffle(vids)
        split = max(1, int(len(vids) * 0.85))
        train_items.extend(vids[:split])
        val_items.extend(vids[split:])

    train_items = oversample(train_items, len(classnames))
    print(f"Train: {len(train_items)}  Val: {len(val_items)}\n")

    model   = build_model(len(classnames)).to(DEVICE)
    model.train()
    loss_fn = nn.CrossEntropyLoss(weight=class_weights(classnames, videos).to(DEVICE))
    opt     = optim.AdamW(model.parameters(), lr=LR, weight_decay=1e-4)
    sched   = CosineAnnealingLR(opt, T_max=EPOCHS, eta_min=LR * 0.05)
    best_acc = -1.0

    for epoch in range(1, EPOCHS + 1):
        t0 = time.time()
        random.shuffle(train_items)
        total_loss, steps = 0.0, 0

        for i in range(0, len(train_items), BATCH_SIZE):
            X, Y = make_batch(train_items[i:i+BATCH_SIZE], do_augment=True)
            if X is None: continue
            X, Y = X.to(DEVICE), Y.to(DEVICE)
            opt.zero_grad(set_to_none=True)
            loss = loss_fn(model(X), Y)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            total_loss += loss.item()
            steps += 1

        sched.step()
        acc, per_cls = validate(model, val_items, classnames) if val_items else (0.0, {})
        avg_loss     = total_loss / max(1, steps)
        lr_now       = sched.get_last_lr()[0]

        print(f"Epoch {epoch:3d}/{EPOCHS}  loss={avg_loss:.4f}  "
              f"val={acc:.3f}  lr={lr_now:.2e}  {time.time()-t0:.0f}s")
        for cls_name, cls_acc in per_cls.items():
            tag = "  (no val data)" if cls_acc is None else f"  {cls_acc:.3f}"
            print(f"    {cls_name:20s}{tag}")

        ckpt = {"model_state": model.state_dict(),
                "classnames":  classnames,
                "clip_len":    CLIP_LEN,
                "img_size":    IMG_SIZE,
                "epoch":       epoch,
                "val_acc":     round(acc, 4)}
        torch.save(ckpt, RUN_DIR / "last.pt")
        if acc > best_acc:
            best_acc = acc
            torch.save(ckpt, RUN_DIR / "best.pt")
            print(f"    ★ New best  val={best_acc:.3f}")

    print("\n" + "=" * 60)
    print(f"Done.  Best val_acc={best_acc:.3f}")
    print(f"Checkpoint : {RUN_DIR / 'best.pt'}")
    print("=" * 60)


if __name__ == "__main__":
    main()
