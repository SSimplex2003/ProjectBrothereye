"""Leave-videos-out evaluation: the honest accuracy estimate.

The normal val split is the tail of each training clip, so it is the same
scene, person and lighting as train and scores close to 100 %.  This script
instead holds out *whole videos* per class, trains a throw-away model on the
rest and reports accuracy on footage the model has never seen — a much closer
proxy for a new camera.

Classes with a single video can't hold one out; they fall back to their
normal tail split (and their score is optimistic).

Usage (after the collect scripts have run):
    python AI/training/evaluate_holdout.py tool
    python AI/training/evaluate_holdout.py action
    python AI/training/evaluate_holdout.py tool --hold-fraction 0.3 --epochs 25

Nothing in AI/runs is touched; output goes to actions_dataset/_holdout_<kind>.
"""
import argparse
import shutil
from collections import defaultdict
from pathlib import Path

from train_common import BASE_MODEL, ROOT, evaluate

from brothereye.crops import HAND_CROP_SIZE, PERSON_CROP_SIZE

KINDS = {"tool": ("tool_crops", HAND_CROP_SIZE), "action": ("action_crops", PERSON_CROP_SIZE)}


def _video_id(f: Path) -> str:
    return f.stem[:4]                      # files are named v{idx:03d}_{frame:06d}.jpg


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("kind", choices=KINDS)
    ap.add_argument("--hold-fraction", type=float, default=0.3,
                    help="share of each class's videos held out (at least 1)")
    ap.add_argument("--epochs", type=int, default=25)
    args = ap.parse_args()

    from ultralytics import YOLO

    sub, imgsz = KINDS[args.kind]
    src = ROOT / "actions_dataset" / sub
    out = ROOT / "actions_dataset" / f"_holdout_{args.kind}"
    if not (src / "train").is_dir():
        raise SystemExit(f"{src} not found — run the collect script first.")

    # collect original (non-oversampled) crops per class and video
    files: dict[str, dict[str, list[tuple[str, Path]]]] = defaultdict(lambda: defaultdict(list))
    for split in ("train", "val"):
        for f in (src / split).rglob("*.jpg"):
            if "_dup" not in f.stem:
                files[f.parent.name][_video_id(f)].append((split, f))

    shutil.rmtree(out, ignore_errors=True)
    print(f"\nHeld-out videos ({args.kind}):")
    for cls, vids in sorted(files.items()):
        ids = sorted(vids)
        n_hold = max(1, round(len(ids) * args.hold_fraction)) if len(ids) > 1 else 0
        # spread held-out videos across the list rather than taking the last few
        held = set(ids[i] for i in
                   sorted({round(k * (len(ids) - 1) / max(1, n_hold - 1)) for k in range(n_hold)})) \
            if n_hold > 1 else ({ids[len(ids) // 2]} if n_hold == 1 else set())
        print(f"  {cls:<12} {len(ids)} videos, held out: {sorted(held) or 'none (tail split)'}")
        for vid, items in vids.items():
            for split, f in items:
                if held:
                    dst = "val" if vid in held else ("train" if split == "train" else None)
                else:
                    dst = split
                if dst:
                    d = out / dst / cls
                    d.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(f, d / f.name)

    for s in ("train", "val"):
        print(f"  {s}: " + ", ".join(f"{c.name}={len(list(c.glob('*.jpg')))}"
                                     for c in sorted((out / s).iterdir())))

    YOLO(str(BASE_MODEL)).train(data=str(out), epochs=args.epochs, imgsz=imgsz, batch=32,
                                patience=8, project=str(out / "run"), name="m",
                                exist_ok=True, verbose=False, plots=False, workers=0)
    classes = sorted(c.name for c in (out / "train").iterdir())
    evaluate(out / "run" / "m" / "weights" / "best.pt", out / "val", classes)
    print(f"\n(Scratch output in {out} — safe to delete.)")


if __name__ == "__main__":
    main()
