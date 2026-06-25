import os
import time
from datetime import datetime, timezone
from pathlib import Path
from collections import deque

import cv2
import numpy as np
import requests
from ultralytics import YOLO

# -----------------------------
# Paths / Config
# -----------------------------
ROOT = Path(__file__).resolve().parents[1]

N8N_URL = "http://localhost:5678/webhook/work-monitor"
SEND_EVERY_SEC = 2.0

ZONE_X, ZONE_Y, ZONE_W, ZONE_H = 100, 100, 400, 400

POSE_MODEL_PATH = str(ROOT / "yolov8n-pose.pt")
SEG_MODEL_PATH  = str(ROOT / "yolov8n-seg.pt")

POSE_CONF = 0.35
POSE_IOU  = 0.50

SEG_CONF  = 0.25
SEG_MASK_THRESH = 0.50

BLUR_K = 55
MASK_FEATHER = 9

# X3D
ENABLE_X3D = True
X3D_MODEL_PATH = str(ROOT / "AI" / "runs" / "x3d" / "best.pt")
X3D_CLIP_LEN = 16
X3D_LABEL_EVERY_N_FRAMES = 8

# Cameras
LAPTOP_CAM_INDEX = 0

# Choose behavior:
#   "both" = process both feeds (slower)
#   "rtsp" = only RTSP feed
#   "laptop" = only laptop feed
MODE = "both"

# Low-latency knobs for RTSP
RTSP_FORCE_TCP = True           # True reduces packet loss jitter
RTSP_BUFFER_SIZE = 1            # small buffer
DROP_OLD_FRAMES = True          # aggressively keep most recent frame


# -----------------------------
# X3D Classifier
# -----------------------------
class X3DClassifier:
    def __init__(self, ckpt_path, device="cpu", clip_len=16, classnames=None):
        import torch
        import torch.nn as nn

        self.torch = torch
        self.nn = nn
        self.device = device
        self.clip_len = clip_len

        if not Path(ckpt_path).exists():
            raise FileNotFoundError(f"Missing X3D checkpoint: {ckpt_path}")

        ckpt = torch.load(ckpt_path, map_location="cpu")

        if isinstance(ckpt, dict) and "model_state" in ckpt:
            state = ckpt["model_state"]
            ckpt_names = ckpt.get("classnames", None)
        else:
            state = ckpt
            ckpt_names = None

        self.classnames = classnames or ckpt_names
        if not self.classnames:
            raise ValueError("No classnames provided and not found in checkpoint.")

        num_classes = len(self.classnames)

        self.model = torch.hub.load("facebookresearch/pytorchvideo", "x3d_xs", pretrained=False)

        try:
            in_features = self.model.blocks[-1].proj.in_features
            self.model.blocks[-1].proj = nn.Linear(in_features, num_classes)
        except Exception:
            in_features = self.model.head.projection.in_features
            self.model.head.projection = nn.Linear(in_features, num_classes)

        self.model.load_state_dict(state, strict=True)
        self.model.eval().to(device)

    def _preprocess(self, frames_bgr):
        torch = self.torch
        frames_rgb = [cv2.cvtColor(f, cv2.COLOR_BGR2RGB) for f in frames_bgr]
        arr = np.stack(frames_rgb, axis=0).astype(np.float32) / 255.0

        T, H, W, _ = arr.shape
        target_short = 182
        scale = target_short / min(H, W)
        new_w, new_h = int(W * scale), int(H * scale)
        resized = np.stack([cv2.resize(arr[t], (new_w, new_h), interpolation=cv2.INTER_LINEAR) for t in range(T)], axis=0)

        crop = 160
        y0 = max(0, (new_h - crop) // 2)
        x0 = max(0, (new_w - crop) // 2)
        cropped = resized[:, y0:y0 + crop, x0:x0 + crop, :]

        x = torch.from_numpy(cropped).permute(3, 0, 1, 2).unsqueeze(0)
        mean = torch.tensor([0.45, 0.45, 0.45], device=self.device).view(1, 3, 1, 1, 1)
        std  = torch.tensor([0.225, 0.225, 0.225], device=self.device).view(1, 3, 1, 1, 1)
        x = (x - mean) / std
        return x

    def predict(self, clip_frames_bgr):
        torch = self.torch
        with torch.no_grad():
            x = self._preprocess(clip_frames_bgr)
            logits = self.model(x)
            probs = torch.softmax(logits, dim=1)[0]
            idx = int(torch.argmax(probs).item())
            conf = float(probs[idx].item())
            label = self.classnames[idx] if idx < len(self.classnames) else f"class_{idx}"
            return label, conf


# -----------------------------
# Utility functions
# -----------------------------
def clamp(v, lo, hi): return max(lo, min(hi, v))

def bbox_iou(a, b):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
    denom = area_a + area_b - inter
    return inter / denom if denom > 0 else 0.0

def feather_mask(mask_bool, k=9):
    k = k if k % 2 == 1 else k + 1
    m = (mask_bool.astype(np.uint8) * 255)
    m = cv2.GaussianBlur(m, (k, k), 0)
    return m > 128

def blur_mask_only(frame_bgr, mask_bool, k=55):
    k = k if k % 2 == 1 else k + 1
    blurred = cv2.GaussianBlur(frame_bgr, (k, k), 0)
    frame_bgr[mask_bool] = blurred[mask_bool]

def blur_region(img, x1, y1, x2, y2, k=55):
    h, w = img.shape[:2]
    x1 = clamp(int(x1), 0, w-1)
    y1 = clamp(int(y1), 0, h-1)
    x2 = clamp(int(x2), 0, w-1)
    y2 = clamp(int(y2), 0, h-1)
    if x2 <= x1 or y2 <= y1:
        return
    roi = img[y1:y2, x1:x2]
    if roi.size == 0:
        return
    k = k if k % 2 == 1 else k + 1
    img[y1:y2, x1:x2] = cv2.GaussianBlur(roi, (k, k), 0)

def movement_speed(track_id, cx, cy, t, last_centers):
    prev = last_centers.get(track_id)
    last_centers[track_id] = (cx, cy, t)
    if prev is None:
        return 0.0
    px, py, pt = prev
    dt = max(1e-6, t - pt)
    dist = ((cx - px)**2 + (cy - py)**2) ** 0.5
    return dist / dt

def safe_pt(kpts_xy, idx):
    if kpts_xy is None:
        return None
    return kpts_xy[idx] if kpts_xy[idx] is not None else None

def estimate_head_direction(kpts_xy):
    nose = safe_pt(kpts_xy, 0)
    ls = safe_pt(kpts_xy, 5)
    rs = safe_pt(kpts_xy, 6)
    if nose is None or ls is None or rs is None:
        return "Unknown"
    shoulder_mid_x = (ls[0] + rs[0]) / 2.0
    dx = nose[0] - shoulder_mid_x
    if dx > 20: return "Right"
    if dx < -20: return "Left"
    return "Forward"

def hands_state(kpts_xy):
    ls, rs = safe_pt(kpts_xy, 5), safe_pt(kpts_xy, 6)
    lw, rw = safe_pt(kpts_xy, 9), safe_pt(kpts_xy, 10)
    lh, rh = safe_pt(kpts_xy, 11), safe_pt(kpts_xy, 12)
    if ls is None or rs is None or lh is None or rh is None:
        return "Unknown"
    shoulder_y = (ls[1] + rs[1]) / 2.0
    hip_y = (lh[1] + rh[1]) / 2.0
    wrists = [p for p in (lw, rw) if p is not None]
    if not wrists:
        return "NoWrist"
    wy = sum(p[1] for p in wrists) / len(wrists)
    if wy < shoulder_y - 10: return "HandsUp"
    if shoulder_y - 10 <= wy <= hip_y + 10: return "HandsMid"
    return "HandsLow"

def posture_state(kpts_xy):
    lh, rh = safe_pt(kpts_xy, 11), safe_pt(kpts_xy, 12)
    lk, rk = safe_pt(kpts_xy, 13), safe_pt(kpts_xy, 14)
    la, ra = safe_pt(kpts_xy, 15), safe_pt(kpts_xy, 16)
    if lh is None or rh is None:
        return "Unknown"
    knees = [p for p in (lk, rk) if p is not None]
    ankles = [p for p in (la, ra) if p is not None]
    if not knees or not ankles:
        return "Unknown"
    hips_y = (lh[1] + rh[1]) / 2.0
    knees_y = sum(p[1] for p in knees) / len(knees)
    ankles_y = sum(p[1] for p in ankles) / len(ankles)
    if abs(knees_y - hips_y) < 60:
        return "SittingOrCrouch"
    if (ankles_y - knees_y) > 60:
        return "Standing"
    return "Leaning"

def classify_fallback(head_dir, hands, posture, speed_px_s, in_zone):
    if speed_px_s > 90:
        return "moving"
    if not in_zone:
        return "break"
    if posture in ("SittingOrCrouch", "Leaning") and hands in ("HandsMid", "HandsLow"):
        return "work"
    if head_dir in ("Left", "Right"):
        return "work"
    return "work"

SKELETON_EDGES = [
    (5, 6), (5, 7), (7, 9), (6, 8), (8, 10),
    (5, 11), (6, 12), (11, 12), (11, 13), (13, 15),
    (12, 14), (14, 16), (0, 5), (0, 6)
]

def draw_skeleton(img, kpts_xy):
    for a, b in SKELETON_EDGES:
        pa = kpts_xy[a] if kpts_xy else None
        pb = kpts_xy[b] if kpts_xy else None
        if pa is None or pb is None:
            continue
        cv2.line(img, (int(pa[0]), int(pa[1])), (int(pb[0]), int(pb[1])), (255, 0, 0), 2)
    if kpts_xy:
        for p in kpts_xy:
            if p is None:
                continue
            cv2.circle(img, (int(p[0]), int(p[1])), 3, (0, 255, 0), -1)

def extract_people(result):
    people = []
    if result.boxes is None or len(result.boxes) == 0:
        return people

    ids = result.boxes.id
    xyxy = result.boxes.xyxy
    kpts = result.keypoints

    kpts_xy_all = None
    kpts_conf_all = None
    if kpts is not None:
        kpts_xy_all = kpts.xy.cpu().numpy()
        kpts_conf_all = kpts.conf.cpu().numpy()

    for i in range(len(xyxy)):
        track_id = int(ids[i].item()) if ids is not None and ids[i] is not None else -1
        x1, y1, x2, y2 = xyxy[i].cpu().numpy().tolist()

        kpts_xy = None
        if kpts_xy_all is not None and kpts_conf_all is not None:
            pts = []
            for j in range(17):
                conf = float(kpts_conf_all[i][j])
                pts.append((float(kpts_xy_all[i][j][0]), float(kpts_xy_all[i][j][1])) if conf >= 0.35 else None)
            kpts_xy = pts

        people.append({"id": track_id, "bbox": (x1, y1, x2, y2), "kpts": kpts_xy})
    return people


class ActionSegmenter:
    def __init__(self, start_n=3, end_m=3, conf_start=0.70, conf_end=0.45):
        self.start_n = start_n
        self.end_m = end_m
        self.conf_start = conf_start
        self.conf_end = conf_end
        self.active_label = None
        self.active_start_ts = None
        self._hi = 0
        self._lo = 0

    def update(self, label, conf, ts):
        finished = None
        active = None

        if self.active_label is None:
            if label != "other" and conf >= self.conf_start:
                self._hi += 1
                if self._hi >= self.start_n:
                    self.active_label = label
                    self.active_start_ts = ts
                    self._hi = 0
                    self._lo = 0
            else:
                self._hi = 0
            return None, None

        if label == self.active_label and conf >= self.conf_end:
            self._lo = 0
        else:
            self._lo += 1
            if self._lo >= self.end_m:
                end_ts = ts
                dur_s = end_ts - self.active_start_ts
                finished = {
                    "label": self.active_label,
                    "start_ts": self.active_start_ts,
                    "end_ts": end_ts,
                    "duration_s": dur_s,
                }
                self.active_label = None
                self.active_start_ts = None
                self._lo = 0
                self._hi = 0
                return finished, None

        active = {"label": self.active_label, "start_ts": self.active_start_ts, "elapsed_s": ts - self.active_start_ts}
        return None, active


# -----------------------------
# Capture helpers (low latency)
# -----------------------------
def open_rtsp(url: str):
    # Force ffmpeg to use TCP and reduce internal buffering.
    # These env vars help on Windows/OpenCV builds that use ffmpeg.
    if RTSP_FORCE_TCP:
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;3000000|max_delay;0"
    else:
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "stimeout;3000000|max_delay;0"

    cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, RTSP_BUFFER_SIZE)
    return cap

def grab_latest_frame(cap, attempts=3):
    """
    If DROP_OLD_FRAMES=True, we try to keep only the most recent frame.
    """
    if not DROP_OLD_FRAMES:
        return cap.read()

    ok = False
    frame = None
    for _ in range(attempts):
        ok = cap.grab()
        if not ok:
            break
    if ok:
        ok, frame = cap.retrieve()
    else:
        ok, frame = cap.read()
    return ok, frame


# -----------------------------
# Main processing for one frame
# -----------------------------
def process_frame(frame, camera_id, pose_model, seg_model, x3d,
                  track_to_operator, next_operator_num_ref, last_centers,
                  clip_buffers, segmenters, frame_count):

    h, w = frame.shape[:2]

    # Pose tracking
    pose_results = pose_model.track(frame, persist=True, verbose=False, conf=POSE_CONF, iou=POSE_IOU)
    r0 = pose_results[0]
    people = extract_people(r0)

    # Segmentation persons
    seg_results = seg_model.predict(frame, verbose=False, conf=SEG_CONF, classes=[0])
    s0 = seg_results[0]

    seg_boxes, seg_masks = [], []
    if s0.boxes is not None and len(s0.boxes) > 0 and s0.masks is not None:
        seg_xyxy = s0.boxes.xyxy.cpu().numpy()
        seg_m = s0.masks.data.cpu().numpy()  # (N, mh, mw)
        for i in range(len(seg_xyxy)):
            seg_boxes.append(tuple(seg_xyxy[i].tolist()))
            mask = seg_m[i].astype(np.float32)
            mask_rs = cv2.resize(mask, (w, h), interpolation=cv2.INTER_LINEAR)
            seg_masks.append(mask_rs > SEG_MASK_THRESH)

    # Draw zone
    cv2.rectangle(frame, (ZONE_X, ZONE_Y), (ZONE_X + ZONE_W, ZONE_Y + ZONE_H), (255, 0, 0), 2)

    payloads = []

    for p in people:
        tid = p["id"]
        x1, y1, x2, y2 = p["bbox"]
        kpts_xy = p["kpts"]

        if tid not in track_to_operator:
            track_to_operator[tid] = f"{camera_id}_Operator_{next_operator_num_ref[0]}"
            next_operator_num_ref[0] += 1
        op_name = track_to_operator[tid]

        if tid not in segmenters:
            segmenters[tid] = ActionSegmenter()

        # Blur by matched person mask
        best_iou = 0.0
        best_mask = None
        tb = (x1, y1, x2, y2)
        for sb, sm in zip(seg_boxes, seg_masks):
            iou = bbox_iou(tb, sb)
            if iou > best_iou:
                best_iou = iou
                best_mask = sm

        if best_mask is not None and best_iou >= 0.15:
            m = feather_mask(best_mask, k=MASK_FEATHER)
            blur_mask_only(frame, m, k=BLUR_K)
        else:
            blur_region(frame, x1, y1, x2, y2, k=BLUR_K)

        # Features
        cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
        in_zone = (ZONE_X < cx < ZONE_X + ZONE_W) and (ZONE_Y < cy < ZONE_Y + ZONE_H)
        spd = movement_speed((camera_id, tid), cx, cy, time.time(), last_centers)

        head_dir = estimate_head_direction(kpts_xy) if kpts_xy else "Unknown"
        hands = hands_state(kpts_xy) if kpts_xy else "Unknown"
        posture = posture_state(kpts_xy) if kpts_xy else "Unknown"

        # Default action (fallback)
        action_label = classify_fallback(head_dir, hands, posture, spd, in_zone)
        action_conf = 0.60

        # Optional: X3D
        if x3d is not None:
            ix1 = clamp(int(x1), 0, w - 1)
            iy1 = clamp(int(y1), 0, h - 1)
            ix2 = clamp(int(x2), 0, w - 1)
            iy2 = clamp(int(y2), 0, h - 1)
            crop = frame[iy1:iy2, ix1:ix2].copy() if (ix2 > ix1 and iy2 > iy1) else None

            if crop is not None and crop.size > 0:
                crop = cv2.resize(crop, (256, 256), interpolation=cv2.INTER_LINEAR)
                key = (camera_id, tid)
                if key not in clip_buffers:
                    clip_buffers[key] = deque(maxlen=X3D_CLIP_LEN)
                clip_buffers[key].append(crop)

                if len(clip_buffers[key]) == X3D_CLIP_LEN and (frame_count % X3D_LABEL_EVERY_N_FRAMES == 0):
                    try:
                        action_label, action_conf = x3d.predict(list(clip_buffers[key]))
                    except Exception:
                        pass

        finished, active = segmenters[tid].update(action_label, float(action_conf), time.time())

        payloads.append({
            "camera_id": camera_id,
            "worker_name": op_name,
            "activity_type": action_label,
            "confidence": round(float(action_conf), 3),
            "event_time": datetime.now(timezone.utc).isoformat()
        })

        if finished:
            start_iso = datetime.fromtimestamp(finished["start_ts"], tz=timezone.utc).isoformat()
            end_iso = datetime.fromtimestamp(finished["end_ts"], tz=timezone.utc).isoformat()
            dur_min = finished["duration_s"] / 60.0

            payloads.append({
                "camera_id": camera_id,
                "worker_name": op_name,
                "activity_type": finished["label"],
                "start_time": start_iso,
                "end_time": end_iso,
                "duration_minutes": round(dur_min, 2),
                "event_time": datetime.now(timezone.utc).isoformat(),
                "is_log": True
            })

        # UI
        cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (255, 0, 0), 2)
        if kpts_xy:
            draw_skeleton(frame, kpts_xy)

        txt = f"{op_name} {action_label} {action_conf:.2f}"
        if active:
            txt += f" | {active['elapsed_s']:.1f}s"
        cv2.putText(frame, txt, (int(x1), max(20, int(y1) - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

    return frame, payloads


# -----------------------------
# Main
# -----------------------------
def main():
    print("Agent starting. Press Q to quit.")

    pose_model = YOLO(POSE_MODEL_PATH)
    seg_model = YOLO(SEG_MODEL_PATH)

    session = requests.Session()

    # Captures
    cap_laptop = None
    cap_rtsp = None

    if MODE in ("both", "laptop"):
        cap_laptop = cv2.VideoCapture(LAPTOP_CAM_INDEX)
        if not cap_laptop.isOpened():
            print("[WARN] Laptop webcam failed to open.")
            cap_laptop = None

    if MODE in ("both", "rtsp"):
        cap_rtsp = open_rtsp(RTSP_URL)
        if not cap_rtsp.isOpened():
            print("[WARN] RTSP stream failed to open. Check URL/password/RTSP enabled.")
            cap_rtsp = None

    if cap_laptop is None and cap_rtsp is None:
        raise RuntimeError("No cameras opened. Fix laptop cam or RTSP stream.")

    # X3D
    x3d = None
    frame_count = 0
    if ENABLE_X3D:
        try:
            x3d = X3DClassifier(X3D_MODEL_PATH, device="cpu", clip_len=X3D_CLIP_LEN, classnames=None)
            print("X3D ENABLED.")
        except Exception as e:
            print("X3D failed to load, fallback only:", e)
            x3d = None

    last_send_ts = 0.0

    # Shared tracking state (kept separate per camera via keying)
    track_to_operator = {}
    next_operator_num_ref = [1]
    last_centers = {}

    clip_buffers = {}
    segmenters = {}

    while True:
        now_ts = time.time()
        frame_count += 1

        frames_to_show = []

        all_payloads = []

        # Laptop
        if cap_laptop is not None:
            ok0, f0 = cap_laptop.read()
            if ok0 and f0 is not None:
                f0, payloads0 = process_frame(
                    f0, "laptop", pose_model, seg_model, x3d,
                    track_to_operator, next_operator_num_ref, last_centers,
                    clip_buffers, segmenters, frame_count
                )
                frames_to_show.append(("Laptop", f0))
                all_payloads.extend(payloads0)

        # RTSP
        if cap_rtsp is not None:
            ok1, f1 = grab_latest_frame(cap_rtsp)
            if ok1 and f1 is not None:
                f1, payloads1 = process_frame(
                    f1, "rtsp", pose_model, seg_model, x3d,
                    track_to_operator, next_operator_num_ref, last_centers,
                    clip_buffers, segmenters, frame_count
                )
                frames_to_show.append(("RTSP", f1))
                all_payloads.extend(payloads1)

        # Send to n8n periodically
        if (now_ts - last_send_ts) >= SEND_EVERY_SEC and all_payloads:
            for payload in all_payloads:
                try:
                    session.post(N8N_URL, json=payload, timeout=3)
                except Exception as e:
                    print("n8n POST error:", e)
            last_send_ts = now_ts

        # Show windows
        for title, fr in frames_to_show:
            cv2.imshow(f"Agent - {title}", fr)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    if cap_laptop is not None:
        cap_laptop.release()
    if cap_rtsp is not None:
        cap_rtsp.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
