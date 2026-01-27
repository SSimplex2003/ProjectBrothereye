import random
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim

ROOT = Path(__file__).resolve().parents[1]

DATA_DIR = ROOT / "actions_dataset"
RUN_DIR = ROOT / "AI" / "runs" / "x3d"
RUN_DIR.mkdir(parents=True, exist_ok=True)

OUT_CKPT = RUN_DIR / "best.pt"
LABELS_PATH = DATA_DIR / "labels.txt"

EPOCHS = 8
LR = 1e-4
BATCH_SIZE = 4
CLIP_LEN = 16
IMG_SIZE = 160
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# MUST match your folder names under actions_dataset/
CLASSNAMES = ["screwing", "place_part", "measure", "cutting"]


def list_videos():
    items = []
    for i, cname in enumerate(CLASSNAMES):
        folder = DATA_DIR / cname
        if not folder.is_dir():
            print(f"[WARN] Missing folder: {folder}")
            continue
        vids = (
            list(folder.glob("*.mp4")) + list(folder.glob("*.avi")) +
            list(folder.glob("*.mov")) + list(folder.glob("*.mkv"))
        )
        for p in vids:
            items.append((str(p), i))
    random.shuffle(items)
    return items


def sample_clip(video_path, clip_len=16):
    cap = cv2.VideoCapture(video_path)
    frames = []
    ok = True
    while ok:
        ok, frame = cap.read()
        if ok and frame is not None:
            frames.append(frame)
    cap.release()

    if len(frames) < clip_len:
        return None

    start = random.randint(0, len(frames) - clip_len)
    clip = frames[start:start + clip_len]

    clip_rgb = [cv2.cvtColor(f, cv2.COLOR_BGR2RGB) for f in clip]
    arr = np.stack(clip_rgb, axis=0).astype(np.float32) / 255.0  # [T,H,W,3]

    T, H, W, _ = arr.shape
    target_short = 182
    scale = target_short / min(H, W)
    new_w, new_h = int(W * scale), int(H * scale)

    resized = np.stack(
        [cv2.resize(arr[t], (new_w, new_h), interpolation=cv2.INTER_LINEAR) for t in range(T)],
        axis=0
    )

    crop = IMG_SIZE
    y0 = max(0, (new_h - crop) // 2)
    x0 = max(0, (new_w - crop) // 2)
    cropped = resized[:, y0:y0 + crop, x0:x0 + crop, :]

    x = torch.from_numpy(cropped).permute(3, 0, 1, 2)  # [3,T,H,W]
    mean = torch.tensor([0.45, 0.45, 0.45]).view(3, 1, 1, 1)
    std = torch.tensor([0.225, 0.225, 0.225]).view(3, 1, 1, 1)
    x = (x - mean) / std
    return x.unsqueeze(0)  # [1,3,T,H,W]


def make_batch(samples):
    xs, ys = [], []
    for path, y in samples:
        x = sample_clip(path, CLIP_LEN)
        if x is None:
            continue
        xs.append(x)
        ys.append(y)
    if not xs:
        return None, None
    X = torch.cat(xs, dim=0)
    Y = torch.tensor(ys, dtype=torch.long)
    return X, Y


def build_model(num_classes: int, pretrained: bool = True):
    model = torch.hub.load("facebookresearch/pytorchvideo", "x3d_xs", pretrained=pretrained)

    try:
        in_features = model.blocks[-1].proj.in_features
        model.blocks[-1].proj = nn.Linear(in_features, num_classes)
    except Exception:
        in_features = model.head.projection.in_features
        model.head.projection = nn.Linear(in_features, num_classes)

    return model


def eval_acc(model, val_items):
    model.eval()
    correct, total = 0, 0
    with torch.no_grad():
        for i in range(0, len(val_items), BATCH_SIZE):
            batch = val_items[i:i + BATCH_SIZE]
            X, Y = make_batch(batch)
            if X is None:
                continue
            X, Y = X.to(DEVICE), Y.to(DEVICE)
            logits = model(X)
            pred = torch.argmax(logits, dim=1)
            correct += int((pred == Y).sum().item())
            total += int(Y.numel())
    model.train()
    return (correct / total) if total else 0.0


def main():
    items = list_videos()
    if len(items) < 8:
        print("Not enough videos. Add more clips per class.")
        return

    split = int(0.85 * len(items))
    train_items = items[:split]
    val_items = items[split:]

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    LABELS_PATH.write_text("\n".join(CLASSNAMES) + "\n", encoding="utf-8")

    model = build_model(len(CLASSNAMES), pretrained=True).to(DEVICE)
    model.train()

    opt = optim.AdamW(model.parameters(), lr=LR)
    loss_fn = nn.CrossEntropyLoss()
    best_acc = -1.0

    for epoch in range(1, EPOCHS + 1):
        random.shuffle(train_items)
        total_loss, steps = 0.0, 0

        for i in range(0, len(train_items), BATCH_SIZE):
            batch = train_items[i:i + BATCH_SIZE]
            X, Y = make_batch(batch)
            if X is None:
                continue
            X, Y = X.to(DEVICE), Y.to(DEVICE)

            opt.zero_grad(set_to_none=True)
            logits = model(X)
            loss = loss_fn(logits, Y)
            loss.backward()
            opt.step()

            total_loss += float(loss.item())
            steps += 1

        acc = eval_acc(model, val_items)
        avg_loss = total_loss / max(1, steps)
        print(f"Epoch {epoch}/{EPOCHS} | loss={avg_loss:.4f} | val_acc={acc:.3f}")

        if acc > best_acc:
            best_acc = acc
            ckpt = {
                "model_state": model.state_dict(),
                "classnames": CLASSNAMES,
                "clip_len": CLIP_LEN,
                "img_size": IMG_SIZE,
            }
            torch.save(ckpt, OUT_CKPT)
            print(f"Saved BEST -> {OUT_CKPT} (val_acc={best_acc:.3f})")

    print("Done.")
    print("Checkpoint:", OUT_CKPT)
    print("Labels    :", LABELS_PATH)


if __name__ == "__main__":
    main()
