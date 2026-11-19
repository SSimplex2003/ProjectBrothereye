"""Extract whole-person crops from the class videos for the action classifier.

Output: actions_dataset/action_crops/{train,val}/{class}/*.jpg
Crops are built with brothereye.crops.person_crop — the same function the live
camera loop uses — so training and inference see identical crops.
"""
from dataset_common import DATA_DIR, build_dataset

from brothereye.crops import person_crop

CROP_DIR = DATA_DIR / "action_crops"


def make_crop(frame, bbox, kxy, kcon):
    # The live server only classifies detected people, so frames without a
    # person would only teach the model to label empty scenes.
    if bbox is None:
        return None
    return person_crop(frame, bbox)


def main() -> None:
    build_dataset(CROP_DIR, make_crop, "Action Frame Extraction")
    print("Next → python AI/training/train_action_classifier.py")


if __name__ == "__main__":
    main()
