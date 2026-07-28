import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from ultralytics import YOLO

ROOT      = Path(__file__).resolve().parents[2]
CROP_DIR  = ROOT / "actions_dataset" / "tool_crops"
RUN_DIR   = ROOT / "AI" / "runs" / "tool_classifier"
RUN_DIR.mkdir(parents=True, exist_ok=True)

BASE_MODEL = "yolov8n-cls.pt"
EPOCHS     = 50
IMG_SIZE   = 128
BATCH      = 32
PATIENCE   = 12
LR0        = 1e-3
LRF        = 0.01


def main() -> None:
    print("=" * 60)
    print("Tool Classifier Training")
    print(f"Data   : {CROP_DIR}")
    print(f"Output : {RUN_DIR}")
    print("=" * 60)

    train_dir = CROP_DIR / "train"
    if not train_dir.exists():
        print("\nNo crop directory found.")
        print("Run:  python training/collect_crops.py  first.")
        return

    classes = sorted(d.name for d in train_dir.iterdir() if d.is_dir())
    if len(classes) < 2:
        print(f"Need at least 2 classes, found: {classes}")
        return

    print(f"\nClasses ({len(classes)}): {classes}")
    val_dir = CROP_DIR / "val"
    for cls in classes:
        n_tr = len(list((train_dir / cls).glob("*.jpg")))
        n_vl = (len(list((val_dir / cls).glob("*.jpg")))
                if val_dir.exists() and (val_dir / cls).exists() else 0)
        print(f"  {cls:20s}  {n_tr:4d} train   {n_vl:3d} val")

    print(f"\nBase model : {BASE_MODEL}")
    print(f"Max epochs : {EPOCHS}  (early stop patience={PATIENCE})\n")

    model = YOLO(BASE_MODEL)
    model.train(
        data     = str(CROP_DIR),
        epochs   = EPOCHS,
        imgsz    = IMG_SIZE,
        batch    = BATCH,
        lr0      = LR0,
        lrf      = LRF,
        patience = PATIENCE,
        augment  = True,
        project  = str(RUN_DIR.parent),
        name     = "tool_classifier",
        exist_ok = True,
        verbose  = True,
    )

    best = RUN_DIR / "weights" / "best.pt"
    if not best.exists():
        best = RUN_DIR.parent / "tool_classifier" / "weights" / "best.pt"

    if best.exists():
        print(f"\n✓ Best weights saved → {best}")
        print("\nPer-class prediction check:")
        val_model = YOLO(str(best))
        for cls in classes:
            samples = list((train_dir / cls).glob("*.jpg"))[:3]
            preds   = []
            for s in samples:
                r = val_model.predict(str(s), verbose=False)
                if r and r[0].probs is not None:
                    preds.append(r[0].names[int(r[0].probs.top1)])
            print(f"  {cls:20s} → {preds}")
    else:
        print(f"\nWeights not found at {best}")

    import shutil
    if CROP_DIR.exists():
        shutil.rmtree(CROP_DIR)
        print(f"\nCrops deleted ({CROP_DIR.name}) — weights are all that's needed.")

    print("\n" + "=" * 60)
    print("Tool classifier ready. Start the server to use it.")
    print("=" * 60)


if __name__ == "__main__":
    main()
