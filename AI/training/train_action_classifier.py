"""Train the action classifier (whole-person crops) → AI/runs/action_classifier."""
from train_common import ROOT, train

from brothereye.crops import PERSON_CROP_SIZE


def main() -> None:
    train(crop_dir     = ROOT / "actions_dataset" / "action_crops",
          run_name     = "action_classifier",
          img_size     = PERSON_CROP_SIZE,
          title        = "Action Classifier Training",
          collect_hint = "python AI/training/collect_action_frames.py",
          keep_crops   = True)


if __name__ == "__main__":
    main()
