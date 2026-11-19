"""Train the tool classifier (hand-region crops) → AI/runs/tool_classifier."""
from train_common import ROOT, train

from brothereye.crops import HAND_CROP_SIZE


def main() -> None:
    train(crop_dir     = ROOT / "actions_dataset" / "tool_crops",
          run_name     = "tool_classifier",
          img_size     = HAND_CROP_SIZE,
          title        = "Tool Classifier Training",
          collect_hint = "python AI/training/collect_crops.py",
          keep_crops   = True)


if __name__ == "__main__":
    main()
