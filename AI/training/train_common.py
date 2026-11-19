"""Shared YOLOv8-cls training + honest per-class evaluation on the val split."""
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from ultralytics import YOLO

ROOT       = Path(__file__).resolve().parents[2]
BASE_MODEL = str(ROOT / "yolov8n-cls.pt")
EPOCHS     = 60
BATCH      = 32
PATIENCE   = 15
LR0        = 1e-3
LRF        = 0.01


def _count(d: Path) -> int:
    return len(list(d.glob("*.jpg"))) if d.exists() else 0


def train(crop_dir: Path, run_name: str, img_size: int, title: str,
          collect_hint: str, keep_crops: bool = False) -> None:
    run_dir = ROOT / "AI" / "runs" / run_name
    print("=" * 60)
    print(title)
    print(f"Data   : {crop_dir}")
    print(f"Output : {run_dir}")
    print("=" * 60)

    train_dir, val_dir = crop_dir / "train", crop_dir / "val"
    if not train_dir.exists():
        print(f"\nNo crop directory found. Run:  {collect_hint}  first.")
        return
    classes = sorted(d.name for d in train_dir.iterdir() if d.is_dir())
    if len(classes) < 2:
        print(f"Need at least 2 classes, found: {classes}")
        return

    print(f"\nClasses ({len(classes)}): {classes}")
    for cls in classes:
        print(f"  {cls:20s}  {_count(train_dir / cls):5d} train  "
              f"{_count(val_dir / cls):4d} val")

    model = YOLO(BASE_MODEL)
    model.train(
        data     = str(crop_dir),
        epochs   = EPOCHS,
        imgsz    = img_size,
        batch    = BATCH,
        lr0      = LR0,
        lrf      = LRF,
        patience = PATIENCE,
        project  = str(run_dir.parent),
        name     = run_name,
        exist_ok = True,
        verbose  = True,
    )

    best = run_dir / "weights" / "best.pt"
    if not best.exists():
        print(f"\nWeights not found at {best}")
        return
    print(f"\n✓ Best weights saved → {best}")
    evaluate(best, val_dir, classes)

    if not keep_crops:
        shutil.rmtree(crop_dir, ignore_errors=True)
        print(f"\nCrops deleted ({crop_dir.name}) — weights are all that's needed.")


def evaluate(weights: Path, val_dir: Path, classes: list) -> None:
    """Per-class accuracy and confusion on held-out (later-in-clip) frames."""
    model = YOLO(str(weights))
    names = model.names
    conf  = {c: {p: 0 for p in classes} for c in classes}
    for cls in classes:
        files = sorted((val_dir / cls).glob("*.jpg"))
        for i in range(0, len(files), 64):
            for r in model.predict([str(f) for f in files[i:i+64]],
                                   verbose=False):
                pred = names[int(r.probs.top1)]
                if pred in conf[cls]:
                    conf[cls][pred] += 1

    print("\nHeld-out evaluation (val = last 20% of each clip, not seen in training):")
    hdr = "".join(f"{p[:10]:>11s}" for p in classes)
    corner = "true / pred"
    print(f"  {corner:20s}{hdr}   accuracy")
    tot_ok = tot = 0
    for cls in classes:
        row = conf[cls]
        n   = sum(row.values())
        ok  = row[cls]
        tot_ok += ok
        tot += n
        acc = f"{ok / n:6.1%}" if n else "   n/a"
        print(f"  {cls:20s}" + "".join(f"{row[p]:11d}" for p in classes)
              + f"   {acc}  ({n} imgs)")
    if tot:
        print(f"  overall: {tot_ok / tot:.1%} on {tot} held-out images")
