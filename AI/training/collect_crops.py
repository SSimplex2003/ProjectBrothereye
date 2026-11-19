"""Extract hand-region crops from the class videos for the tool classifier.

Output: actions_dataset/tool_crops/{train,val}/{class}/*.jpg
Crops are built with brothereye.crops.hand_crop — the same function the live
camera loop uses — so training and inference see identical crops.
"""
from dataset_common import DATA_DIR, build_dataset

from brothereye.crops import hand_crop, wrists_from_keypoints

CROP_DIR = DATA_DIR / "tool_crops"


def make_crop(frame, bbox, kxy, kcon):
    # Frames without a detected person are kept (close-up hand videos);
    # hand_crop falls back to the lower-centre of the frame for those.
    return hand_crop(frame, wrists_from_keypoints(kxy, kcon), bbox)


def main() -> None:
    build_dataset(CROP_DIR, make_crop, "Tool Crop Extraction")
    print("Next → python AI/training/train_classifier.py")


if __name__ == "__main__":
    main()
