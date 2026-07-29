# Brothereye — Training Guide

There are two AI models that need to be trained on your specific dataset before
they reach full accuracy.  The wrist-motion heuristic requires no training and
works out of the box as a fallback.

---

## Model overview

| Model | Purpose | Training time (CPU) | Input |
|---|---|---|---|
| **Tool Classifier** (YOLOv8n-cls) | Identifies which tool is in the worker's hand | ~15 min | Single frame crop of the hand region |
| **Action Classifier** (YOLOv8n-cls) | Classifies the action from the full-body crop | ~15 min | Single frame crop of the whole person |

Train the **Tool Classifier first** — the server can also use it to learn a
workflow from a reference video (`/api/workflow/<id>/learn`).

---

## Dataset layout

Videos go in `actions_dataset/` with one sub-folder per action class.
Any video format supported by OpenCV works (`.mp4`, `.mov`, `.avi`, `.mkv`).

```
actions_dataset/
    screwing/
        clip1.mp4
        clip2.mov
        ...
    cutting/
        cut_demo.mp4
    measure/
        measure1.mp4
        measure2.mp4
    place_part/
        assembly1.mp4
        assembly2.mov
```

**Minimum:** 1 video per class.  **Recommended:** 5+ videos per class,
especially for classes you want to detect reliably.  The `screwing` class
currently has the most data and will be the most accurate.

---

## Step 1 — Extract hand crops

This script uses YOLO pose to locate the worker's wrists in each video frame,
crops a square region around the hands (where the tool is visible), and saves
them into a labelled image dataset.

```powershell
.venv\Scripts\python.exe AI\training\collect_crops.py
```

Output in `actions_dataset/tool_crops/train/{class}/` and `…/val/{class}/`.

You should see something like:

```
── screwing  (14 videos)
  clip1.mp4
    → 280 train  +  49 val
  ...
── cutting  (1 video)
  cut_demo.mp4
    → 34 train  +  6 val
```

If a class shows fewer than 30 crops, add more videos before training.

---

## Step 2 — Train the tool classifier

Fine-tunes `yolov8n-cls.pt` on the crops extracted above.

```powershell
.venv\Scripts\python.exe AI\training\train_classifier.py
```

Training runs for up to 50 epochs with early stopping (patience = 12).
On CPU this takes about 10–20 minutes.

The best weights are saved to:
```
AI/runs/tool_classifier/weights/best.pt
```

At the end the script prints a per-class prediction check:
```
  screwing              → ['screwing', 'screwing', 'screwing']
  cutting               → ['cutting', 'cutting', 'measure']
  measure               → ['measure', 'measure', 'measure']
  place_part            → ['place_part', 'place_part', 'place_part']
```

If a class is frequently misclassified, add more videos for it and re-run
both steps.

---

## Step 3 — Train the action classifier (optional but recommended)

The action classifier looks at the full-body crop and can catch actions that
are ambiguous from the hand crop alone.

```powershell
.venv\Scripts\python.exe AI\training\collect_action_frames.py
.venv\Scripts\python.exe AI\training\train_action_classifier.py
```

Training runs for up to 50 epochs with early stopping (patience = 12).  Best
weights saved to:
```
AI/runs/action_classifier/weights/best.pt
```

The action classifier is optional.  If the checkpoint is not present the
server runs with the tool classifier and wrist heuristic only.

---

## Step 4 — Start the server

```powershell
.\start.ps1
```

The server automatically loads both trained models on startup and logs which
models were found.

---

## Learning a workflow from a reference video

Once the tool classifier is trained you can teach the server a production
workflow by showing it a reference video instead of configuring steps manually.

```powershell
curl -X POST http://localhost:5000/api/workflow/cam1/learn `
     -H "Content-Type: application/json" `
     -d '{"video_path": "C:/Videos/reference_cycle.mp4"}'
```

The server will:
1. Watch the reference video frame by frame
2. Run the tool classifier on each frame's hand region
3. Group the frame labels into sustained segments
4. Return the detected step sequence and configure the workflow tracker

The learned steps are saved automatically and restored when the server restarts.

---

## Retraining after adding new videos

Just re-run all four steps.  The scripts overwrite the previous output.

```powershell
.venv\Scripts\python.exe AI\training\collect_crops.py
.venv\Scripts\python.exe AI\training\train_classifier.py
.venv\Scripts\python.exe AI\training\collect_action_frames.py
.venv\Scripts\python.exe AI\training\train_action_classifier.py
```

Then restart the server:
```powershell
.\start.ps1
```

---

## Tips for better accuracy

- **More screwing videos are always better** — screwing is the primary detection
  target so 10+ varied clips is ideal.
- **Vary lighting and angle** — clip from above, side, and close-up all help.
- **Keep clips to 5–30 seconds** — very long clips just get sampled more; they
  don't add more variety.
- **Class balance matters** — if `screwing` has 14 videos and `cutting` has 1,
  the classifier will lean towards screwing.  The training script oversamples
  minority classes automatically, but adding more real videos is always better.
- **Close-up hand videos work well** — the tool is clearly visible even if YOLO
  pose cannot find the full body.
