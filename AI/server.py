"""
stream_server.py
================
AI-powered multi-camera streaming server.

Features
--------
- Add any number of cameras at runtime via REST API (RTSP, USB/index, HTTP MJPEG)
- Per-camera MJPEG stream with YOLO pose + segmentation overlay
- Optional X3D action classification per camera
- n8n webhook forwarding
- CORS enabled for Next.js / v0 frontend
- /api/health and /api/stream-sources for frontend integration

Quick start
-----------
    pip install -r requirements.txt
    python stream_server.py

    # Add cameras via API
    curl -X POST http://localhost:5000/api/cameras \
         -H "Content-Type: application/json" \
         -d '{"id":"cam1","source":"rtsp://admin:pass@192.168.0.101:554/stream"}'

    curl -X POST http://localhost:5000/api/cameras \
         -H "Content-Type: application/json" \
         -d '{"id":"laptop","source":0}'

    # Watch in browser
    http://localhost:5000               <- dashboard (all streams)
    http://localhost:5000/stream/cam1   <- raw MJPEG
    http://localhost:5000/snapshot/cam1 <- single JPEG

API reference
-------------
    GET  /api/health                    server health + camera counts
    GET  /api/stream-sources            all cameras with stream/snapshot URLs pre-built
    GET  /api/cameras                   list all cameras and status
    POST /api/cameras                   add a camera  {id, source, zone?, label?}
    GET  /api/cameras/<id>              single camera status + stats
    DELETE /api/cameras/<id>            stop and remove a camera
    GET  /stream/<id>                   MJPEG stream for camera <id>
    GET  /snapshot/<id>                 single JPEG snapshot
    GET  /api/events                    last 200 activity events (all cameras)
    GET  /api/events/<id>               last 200 events for one camera
    GET  /api/docs                      full reference as JSON

Camera source formats
---------------------
    0, 1, 2 ...                         USB / built-in webcam index
    "rtsp://user:pass@host/path"        RTSP stream (any brand IP camera)
    "http://host/video.mjpg"            HTTP MJPEG source
    "/dev/video0"                       Linux v4l2 device path

Auto-start cameras via environment variable
-------------------------------------------
    INIT_CAMERAS=laptop:0,cam1:rtsp://admin:pass@192.168.0.101:554/stream \
        python stream_server.py

CORS
----
    All origins allowed by default. To restrict to your frontend:
        CORS_ORIGINS=https://your-app.vercel.app python stream_server.py
"""

from __future__ import annotations

import os
import time
import threading
import logging
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
import requests
from flask import Flask, Response, jsonify, request, abort
from flask_cors import CORS

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("stream_server")

# ---------------------------------------------------------------------------
# Global config  --  edit these or override via environment variables
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent

POSE_MODEL_PATH = str(ROOT / "yolov8n-pose.pt")
SEG_MODEL_PATH  = str(ROOT / "yolov8n-seg.pt")
X3D_MODEL_PATH  = str(ROOT / "AI" / "runs" / "x3d" / "best.pt")

POSE_CONF = float(os.getenv("POSE_CONF", "0.35"))
POSE_IOU  = float(os.getenv("POSE_IOU",  "0.50"))
SEG_CONF  = float(os.getenv("SEG_CONF",  "0.25"))
SEG_MASK_THRESH = 0.50
BLUR_K          = 55
MASK_FEATHER    = 9

ENABLE_X3D        = os.getenv("ENABLE_X3D", "1") == "1"
X3D_CLIP_LEN      = 16
X3D_LABEL_EVERY_N = 8

N8N_URL        = os.getenv("N8N_URL", "http://localhost:5678/webhook/work-monitor")
N8N_ENABLED    = os.getenv("N8N_ENABLED", "1") == "1"
SEND_EVERY_SEC = 2.0

STREAM_JPEG_QUALITY = int(os.getenv("JPEG_QUALITY", "75"))
STREAM_FPS_CAP      = float(os.getenv("STREAM_FPS", "30"))
FRAME_SLEEP         = 1.0 / STREAM_FPS_CAP

SERVER_HOST  = os.getenv("HOST", "0.0.0.0")
SERVER_PORT  = int(os.getenv("PORT", "5000"))
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")

MAX_EVENTS = 200

RTSP_FORCE_TCP   = True
RTSP_BUFFER_SIZE = 1
DROP_OLD_FRAMES  = True

# ---------------------------------------------------------------------------
# Skeleton / pose constants
# ---------------------------------------------------------------------------
SKELETON_EDGES = [
    (5, 6), (5, 7), (7, 9), (6, 8), (8, 10),
    (5, 11), (6, 12), (11, 12), (11, 13), (13, 15),
    (12, 14), (14, 16), (0, 5), (0, 6),
]


# ---------------------------------------------------------------------------
# X3D classifier
# ---------------------------------------------------------------------------
class X3DClassifier:
    def __init__(self, ckpt_path: str, device: str = "cpu",
                 clip_len: int = 16, classnames=None):
        import torch
        import torch.nn as nn

        self._torch   = torch
        self._nn      = nn
        self.device   = device
        self.clip_len = clip_len

        if not Path(ckpt_path).exists():
            raise FileNotFoundError(f"X3D checkpoint not found: {ckpt_path}")

        ckpt = torch.load(ckpt_path, map_location="cpu")
        if isinstance(ckpt, dict) and "model_state" in ckpt:
            state      = ckpt["model_state"]
            ckpt_names = ckpt.get("classnames")
        else:
            state      = ckpt
            ckpt_names = None

        self.classnames = classnames or ckpt_names
        if not self.classnames:
            raise ValueError("No classnames in checkpoint and none provided.")

        self.model = torch.hub.load(
            "facebookresearch/pytorchvideo", "x3d_xs", pretrained=False
        )
        try:
            in_f = self.model.blocks[-1].proj.in_features
            self.model.blocks[-1].proj = nn.Linear(in_f, len(self.classnames))
        except Exception:
            in_f = self.model.head.projection.in_features
            self.model.head.projection = nn.Linear(in_f, len(self.classnames))
        self.model.load_state_dict(state, strict=True)
        self.model.eval().to(device)

    def predict(self, frames_bgr: list) -> tuple[str, float]:
        torch      = self._torch
        frames_rgb = [cv2.cvtColor(f, cv2.COLOR_BGR2RGB) for f in frames_bgr]
        arr        = np.stack(frames_rgb).astype(np.float32) / 255.0
        T, H, W, _ = arr.shape
        scale      = 182 / min(H, W)
        nw, nh     = int(W * scale), int(H * scale)
        resized    = np.stack([cv2.resize(arr[t], (nw, nh)) for t in range(T)])
        crop       = 160
        y0         = max(0, (nh - crop) // 2)
        x0         = max(0, (nw - crop) // 2)
        cropped    = resized[:, y0:y0 + crop, x0:x0 + crop, :]
        x          = torch.from_numpy(cropped).permute(3, 0, 1, 2).unsqueeze(0).to(self.device)
        mean       = torch.tensor([0.45, 0.45, 0.45], device=self.device).view(1, 3, 1, 1, 1)
        std        = torch.tensor([0.225, 0.225, 0.225], device=self.device).view(1, 3, 1, 1, 1)
        x          = (x - mean) / std
        with torch.no_grad():
            logits = self.model(x)
            probs  = torch.softmax(logits, dim=1)[0]
            idx    = int(torch.argmax(probs).item())
            return (
                self.classnames[idx] if idx < len(self.classnames) else f"class_{idx}",
                float(probs[idx].item()),
            )


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------
def clamp(v, lo, hi):
    return max(lo, min(hi, v))

def bbox_iou(a, b):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih   = max(0, ix2 - ix1), max(0, iy2 - iy1)
    inter    = iw * ih
    if inter <= 0:
        return 0.0
    denom = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return inter / denom if denom > 0 else 0.0

def feather_mask(mask_bool, k=9):
    k = k if k % 2 == 1 else k + 1
    m = cv2.GaussianBlur((mask_bool.astype(np.uint8) * 255), (k, k), 0)
    return m > 128

def blur_mask_only(frame, mask_bool, k=55):
    k       = k if k % 2 == 1 else k + 1
    blurred = cv2.GaussianBlur(frame, (k, k), 0)
    frame[mask_bool] = blurred[mask_bool]

def blur_region(img, x1, y1, x2, y2, k=55):
    h, w = img.shape[:2]
    x1   = clamp(int(x1), 0, w - 1)
    y1   = clamp(int(y1), 0, h - 1)
    x2   = clamp(int(x2), 0, w - 1)
    y2   = clamp(int(y2), 0, h - 1)
    if x2 <= x1 or y2 <= y1:
        return
    k = k if k % 2 == 1 else k + 1
    img[y1:y2, x1:x2] = cv2.GaussianBlur(img[y1:y2, x1:x2], (k, k), 0)

def movement_speed(track_key, cx, cy, t, last_centers):
    prev = last_centers.get(track_key)
    last_centers[track_key] = (cx, cy, t)
    if prev is None:
        return 0.0
    px, py, pt = prev
    return ((cx - px) ** 2 + (cy - py) ** 2) ** 0.5 / max(1e-6, t - pt)

def safe_pt(kpts, idx):
    return kpts[idx] if kpts and kpts[idx] is not None else None

def estimate_head_direction(kpts):
    nose, ls, rs = safe_pt(kpts, 0), safe_pt(kpts, 5), safe_pt(kpts, 6)
    if None in (nose, ls, rs):
        return "Unknown"
    dx = nose[0] - (ls[0] + rs[0]) / 2.0
    return "Right" if dx > 20 else ("Left" if dx < -20 else "Forward")

def hands_state(kpts):
    ls, rs = safe_pt(kpts, 5), safe_pt(kpts, 6)
    lw, rw = safe_pt(kpts, 9), safe_pt(kpts, 10)
    lh, rh = safe_pt(kpts, 11), safe_pt(kpts, 12)
    if None in (ls, rs, lh, rh):
        return "Unknown"
    shoulder_y = (ls[1] + rs[1]) / 2.0
    hip_y      = (lh[1] + rh[1]) / 2.0
    wrists     = [p for p in (lw, rw) if p]
    if not wrists:
        return "NoWrist"
    wy = sum(p[1] for p in wrists) / len(wrists)
    if wy < shoulder_y - 10:
        return "HandsUp"
    if wy <= hip_y + 10:
        return "HandsMid"
    return "HandsLow"

def posture_state(kpts):
    lh, rh = safe_pt(kpts, 11), safe_pt(kpts, 12)
    lk, rk = safe_pt(kpts, 13), safe_pt(kpts, 14)
    la, ra = safe_pt(kpts, 15), safe_pt(kpts, 16)
    if None in (lh, rh):
        return "Unknown"
    knees  = [p for p in (lk, rk) if p]
    ankles = [p for p in (la, ra) if p]
    if not knees or not ankles:
        return "Unknown"
    hips_y   = (lh[1] + rh[1]) / 2.0
    knees_y  = sum(p[1] for p in knees) / len(knees)
    ankles_y = sum(p[1] for p in ankles) / len(ankles)
    if abs(knees_y - hips_y) < 60:
        return "SittingOrCrouch"
    return "Standing" if (ankles_y - knees_y) > 60 else "Leaning"

def classify_fallback(head_dir, hands, posture, speed, in_zone):
    if speed > 90:
        return "moving"
    if not in_zone:
        return "break"
    if posture in ("SittingOrCrouch", "Leaning") and hands in ("HandsMid", "HandsLow"):
        return "work"
    if head_dir in ("Left", "Right"):
        return "work"
    return "work"

def draw_skeleton(img, kpts):
    for a, b in SKELETON_EDGES:
        pa, pb = safe_pt(kpts, a), safe_pt(kpts, b)
        if pa and pb:
            cv2.line(img,
                     (int(pa[0]), int(pa[1])),
                     (int(pb[0]), int(pb[1])),
                     (255, 0, 0), 2)
    if kpts:
        for p in kpts:
            if p:
                cv2.circle(img, (int(p[0]), int(p[1])), 3, (0, 255, 0), -1)

def extract_people(result):
    people      = []
    if result.boxes is None or len(result.boxes) == 0:
        return people
    ids         = result.boxes.id
    xyxy        = result.boxes.xyxy
    kpts        = result.keypoints
    kpts_xy_all = kpts.xy.cpu().numpy()   if kpts is not None else None
    kpts_c_all  = kpts.conf.cpu().numpy() if kpts is not None else None
    for i in range(len(xyxy)):
        tid = int(ids[i].item()) if ids is not None and ids[i] is not None else -1
        x1, y1, x2, y2 = xyxy[i].cpu().numpy().tolist()
        pts = None
        if kpts_xy_all is not None:
            pts = []
            for j in range(17):
                c = float(kpts_c_all[i][j])
                pts.append(
                    (float(kpts_xy_all[i][j][0]), float(kpts_xy_all[i][j][1]))
                    if c >= 0.35 else None
                )
        people.append({"id": tid, "bbox": (x1, y1, x2, y2), "kpts": pts})
    return people


# ---------------------------------------------------------------------------
# Action segmenter
# ---------------------------------------------------------------------------
class ActionSegmenter:
    def __init__(self, start_n=3, end_m=3, conf_start=0.70, conf_end=0.45):
        self.start_n, self.end_m       = start_n, end_m
        self.conf_start, self.conf_end = conf_start, conf_end
        self.active_label = self.active_start_ts = None
        self._hi = self._lo = 0

    def update(self, label, conf, ts):
        if self.active_label is None:
            if label != "other" and conf >= self.conf_start:
                self._hi += 1
                if self._hi >= self.start_n:
                    self.active_label, self.active_start_ts = label, ts
                    self._hi = self._lo = 0
            else:
                self._hi = 0
            return None, None

        if label == self.active_label and conf >= self.conf_end:
            self._lo = 0
        else:
            self._lo += 1
            if self._lo >= self.end_m:
                dur      = ts - self.active_start_ts
                finished = {
                    "label":      self.active_label,
                    "start_ts":   self.active_start_ts,
                    "end_ts":     ts,
                    "duration_s": dur,
                }
                self.active_label = self.active_start_ts = None
                self._lo = self._hi = 0
                return finished, None

        return None, {
            "label":     self.active_label,
            "start_ts":  self.active_start_ts,
            "elapsed_s": ts - self.active_start_ts,
        }


# ---------------------------------------------------------------------------
# Camera worker  --  one thread per camera
# ---------------------------------------------------------------------------
class CameraWorker:
    """Manages a single camera: capture, AI inference, JPEG encoding."""

    def __init__(self, camera_id: str, source,
                 label: str = "", zone: tuple = (100, 100, 400, 400),
                 pose_model=None, seg_model=None, x3d=None,
                 n8n_session=None, event_log=None):
        self.camera_id   = camera_id
        self.source      = source
        self.label       = label or camera_id
        self.zone        = zone
        self.pose_model  = pose_model
        self.seg_model   = seg_model
        self.x3d         = x3d
        self.n8n_session = n8n_session
        self.event_log   = event_log

        self._jpeg      = None
        self._jpeg_lock = threading.Lock()
        self._stop_evt  = threading.Event()
        self._thread    = threading.Thread(
            target=self._run, daemon=True, name=f"cam-{camera_id}"
        )

        self.track_to_operator: dict = {}
        self.next_op_num   = [1]
        self.last_centers: dict = {}
        self.clip_buffers: dict = {}
        self.segmenters:   dict = {}
        self.last_send_ts  = 0.0
        self.frame_count   = 0

        self.fps_actual = 0.0
        self.connected  = False
        self.error      = ""
        self.started_at = datetime.now(timezone.utc).isoformat()

    @property
    def latest_jpeg(self) -> bytes | None:
        with self._jpeg_lock:
            return self._jpeg

    def start(self):
        self._thread.start()

    def stop(self):
        self._stop_evt.set()
        self._thread.join(timeout=5)

    def status(self) -> dict:
        return {
            "id":         self.camera_id,
            "label":      self.label,
            "source":     str(self.source),
            "connected":  self.connected,
            "error":      self.error,
            "fps":        round(self.fps_actual, 1),
            "started_at": self.started_at,
        }

    def _open_capture(self):
        src = self.source
        if isinstance(src, int) or (isinstance(src, str) and src.isdigit()):
            return cv2.VideoCapture(int(src))

        if isinstance(src, str):
            if src.startswith("rtsp://"):
                if RTSP_FORCE_TCP:
                    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
                        "rtsp_transport;tcp|stimeout;3000000|max_delay;0"
                    )
                else:
                    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
                        "stimeout;3000000|max_delay;0"
                    )
                cap = cv2.VideoCapture(src, cv2.CAP_FFMPEG)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, RTSP_BUFFER_SIZE)
                return cap

            return cv2.VideoCapture(src)

        raise ValueError(f"Unknown source format: {src!r}")

    def _grab_frame(self, cap):
        if not DROP_OLD_FRAMES:
            return cap.read()
        ok = False
        for _ in range(3):
            ok = cap.grab()
            if not ok:
                break
        if ok:
            return cap.retrieve()
        return cap.read()

    def _run(self):
        log.info("[%s] Worker starting (source=%s)", self.camera_id, self.source)
        cap             = None
        reconnect_delay = 2.0

        while not self._stop_evt.is_set():
            if cap is None or not cap.isOpened():
                try:
                    if cap is not None:
                        cap.release()
                    cap = self._open_capture()
                    if not cap.isOpened():
                        raise RuntimeError("VideoCapture.isOpened() returned False")
                    self.connected = True
                    self.error     = ""
                    log.info("[%s] Connected", self.camera_id)
                except Exception as exc:
                    self.connected = False
                    self.error     = str(exc)
                    log.warning(
                        "[%s] Connection failed: %s — retrying in %.0fs",
                        self.camera_id, exc, reconnect_delay,
                    )
                    time.sleep(reconnect_delay)
                    reconnect_delay = min(reconnect_delay * 2, 30.0)
                    continue
                reconnect_delay = 2.0

            t0        = time.time()
            ok, frame = self._grab_frame(cap)
            if not ok or frame is None:
                self.connected = False
                self.error     = "Frame grab failed"
                cap.release()
                cap = None
                continue

            try:
                annotated, payloads = self._process(frame)
                ok2, jpeg_buf = cv2.imencode(
                    ".jpg", annotated,
                    [cv2.IMWRITE_JPEG_QUALITY, STREAM_JPEG_QUALITY],
                )
                if ok2:
                    with self._jpeg_lock:
                        self._jpeg = jpeg_buf.tobytes()
            except Exception as exc:
                log.error("[%s] Processing error: %s", self.camera_id, exc)
                continue

            now     = time.time()
            elapsed = max(1e-6, now - t0)
            self.fps_actual = 0.9 * self.fps_actual + 0.1 * (1.0 / elapsed)

            if (N8N_ENABLED and self.n8n_session and payloads
                    and (now - self.last_send_ts) >= SEND_EVERY_SEC):
                for p in payloads:
                    try:
                        self.n8n_session.post(N8N_URL, json=p, timeout=3)
                    except Exception:
                        pass
                self.last_send_ts = now

        if cap is not None:
            cap.release()
        log.info("[%s] Worker stopped", self.camera_id)

    def _process(self, frame):
        h, w = frame.shape[:2]
        self.frame_count += 1
        zx, zy, zw, zh = self.zone

        pose_results = self.pose_model.track(
            frame, persist=True, verbose=False, conf=POSE_CONF, iou=POSE_IOU
        )
        people = extract_people(pose_results[0])

        seg_results = self.seg_model.predict(
            frame, verbose=False, conf=SEG_CONF, classes=[0]
        )
        s0 = seg_results[0]
        seg_boxes, seg_masks = [], []
        if s0.boxes is not None and len(s0.boxes) > 0 and s0.masks is not None:
            for i, row in enumerate(s0.boxes.xyxy.cpu().numpy()):
                seg_boxes.append(tuple(row.tolist()))
                mask = s0.masks.data[i].cpu().numpy().astype(np.float32)
                seg_masks.append(cv2.resize(mask, (w, h)) > SEG_MASK_THRESH)

        cv2.rectangle(frame, (zx, zy), (zx + zw, zy + zh), (255, 0, 0), 2)
        cv2.putText(frame, self.label, (zx + 4, zy - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 0, 0), 1)

        payloads = []
        now      = time.time()

        for p in people:
            tid             = p["id"]
            x1, y1, x2, y2 = p["bbox"]
            kpts            = p["kpts"]

            if tid not in self.track_to_operator:
                self.track_to_operator[tid] = f"{self.camera_id}_Op{self.next_op_num[0]}"
                self.next_op_num[0] += 1
            op_name = self.track_to_operator[tid]

            if tid not in self.segmenters:
                self.segmenters[tid] = ActionSegmenter()

            best_iou, best_mask = 0.0, None
            for sb, sm in zip(seg_boxes, seg_masks):
                iou = bbox_iou((x1, y1, x2, y2), sb)
                if iou > best_iou:
                    best_iou, best_mask = iou, sm

            if best_mask is not None and best_iou >= 0.15:
                blur_mask_only(frame, feather_mask(best_mask, k=MASK_FEATHER), k=BLUR_K)
            else:
                blur_region(frame, x1, y1, x2, y2, k=BLUR_K)

            cx, cy  = (x1 + x2) / 2.0, (y1 + y2) / 2.0
            in_zone = (zx < cx < zx + zw) and (zy < cy < zy + zh)
            spd     = movement_speed((self.camera_id, tid), cx, cy, now, self.last_centers)

            head_dir = estimate_head_direction(kpts) if kpts else "Unknown"
            hands    = hands_state(kpts)             if kpts else "Unknown"
            posture  = posture_state(kpts)           if kpts else "Unknown"

            action, conf = classify_fallback(head_dir, hands, posture, spd, in_zone), 0.60

            if self.x3d is not None:
                ix1 = clamp(int(x1), 0, w - 1)
                iy1 = clamp(int(y1), 0, h - 1)
                ix2 = clamp(int(x2), 0, w - 1)
                iy2 = clamp(int(y2), 0, h - 1)
                if ix2 > ix1 and iy2 > iy1:
                    crop = cv2.resize(frame[iy1:iy2, ix1:ix2].copy(), (256, 256))
                    key  = (self.camera_id, tid)
                    if key not in self.clip_buffers:
                        self.clip_buffers[key] = deque(maxlen=X3D_CLIP_LEN)
                    self.clip_buffers[key].append(crop)
                    if (len(self.clip_buffers[key]) == X3D_CLIP_LEN
                            and self.frame_count % X3D_LABEL_EVERY_N == 0):
                        try:
                            action, conf = self.x3d.predict(list(self.clip_buffers[key]))
                        except Exception:
                            pass

            finished, active = self.segmenters[tid].update(action, float(conf), now)

            ev = {
                "camera_id":     self.camera_id,
                "worker_name":   op_name,
                "activity_type": action,
                "confidence":    round(float(conf), 3),
                "event_time":    datetime.now(timezone.utc).isoformat(),
            }
            payloads.append(ev)
            if self.event_log is not None:
                self.event_log.append(ev)

            if finished:
                log_ev = {
                    "camera_id":        self.camera_id,
                    "worker_name":      op_name,
                    "activity_type":    finished["label"],
                    "start_time":       datetime.fromtimestamp(
                        finished["start_ts"], tz=timezone.utc).isoformat(),
                    "end_time":         datetime.fromtimestamp(
                        finished["end_ts"], tz=timezone.utc).isoformat(),
                    "duration_minutes": round(finished["duration_s"] / 60.0, 2),
                    "event_time":       datetime.now(timezone.utc).isoformat(),
                    "is_log":           True,
                }
                payloads.append(log_ev)
                if self.event_log is not None:
                    self.event_log.append(log_ev)

            cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (0, 200, 255), 2)
            if kpts:
                draw_skeleton(frame, kpts)
            label_txt = f"{op_name}  {action}  {conf:.2f}"
            if active:
                label_txt += f"  {active['elapsed_s']:.1f}s"
            cv2.putText(frame, label_txt, (int(x1), max(20, int(y1) - 10)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        return frame, payloads


# ---------------------------------------------------------------------------
# Server  --  manages workers and Flask API
# ---------------------------------------------------------------------------
class StreamingServer:
    def __init__(self):
        from ultralytics import YOLO as _YOLO

        log.info("Loading YOLO models...")
        self.pose_model = _YOLO(POSE_MODEL_PATH)
        self.seg_model  = _YOLO(SEG_MODEL_PATH)
        log.info("YOLO models loaded.")

        self.x3d = None
        if ENABLE_X3D:
            try:
                self.x3d = X3DClassifier(
                    X3D_MODEL_PATH, device="cpu", clip_len=X3D_CLIP_LEN
                )
                log.info("X3D classifier loaded.")
            except Exception as exc:
                log.warning("X3D not loaded (%s) — using fallback classifier.", exc)

        self.n8n_session = requests.Session() if N8N_ENABLED else None

        self._cameras: dict[str, CameraWorker] = {}
        self._cam_lock = threading.Lock()
        self._events: deque = deque(maxlen=MAX_EVENTS)

    # ------------------------------------------------------------------
    # Camera management
    # ------------------------------------------------------------------
    def add_camera(self, camera_id: str, source,
                   label: str = "", zone: tuple = (100, 100, 400, 400)) -> dict:
        with self._cam_lock:
            if camera_id in self._cameras:
                raise ValueError(f"Camera '{camera_id}' already exists.")
            worker = CameraWorker(
                camera_id=camera_id,
                source=source,
                label=label or camera_id,
                zone=zone,
                pose_model=self.pose_model,
                seg_model=self.seg_model,
                x3d=self.x3d,
                n8n_session=self.n8n_session,
                event_log=self._events,
            )
            worker.start()
            self._cameras[camera_id] = worker
        log.info("Camera added: %s (source=%s)", camera_id, source)
        return worker.status()

    def remove_camera(self, camera_id: str):
        with self._cam_lock:
            w = self._cameras.pop(camera_id, None)
        if w is None:
            raise KeyError(f"Camera '{camera_id}' not found.")
        w.stop()
        log.info("Camera removed: %s", camera_id)

    def list_cameras(self) -> list[dict]:
        with self._cam_lock:
            return [w.status() for w in self._cameras.values()]

    def get_camera(self, camera_id: str) -> CameraWorker:
        with self._cam_lock:
            w = self._cameras.get(camera_id)
        if w is None:
            raise KeyError(f"Camera '{camera_id}' not found.")
        return w

    # ------------------------------------------------------------------
    # MJPEG stream generator
    # ------------------------------------------------------------------
    def _mjpeg_gen(self, camera_id: str):
        BOUNDARY = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
        while True:
            try:
                w = self.get_camera(camera_id)
            except KeyError:
                break
            jpeg = w.latest_jpeg
            if jpeg:
                yield BOUNDARY + jpeg + b"\r\n"
            time.sleep(FRAME_SLEEP)

    # ------------------------------------------------------------------
    # Source type helper
    # ------------------------------------------------------------------
    @staticmethod
    def _source_type(src) -> str:
        if isinstance(src, int):
            return "usb"
        s = str(src)
        if s.startswith("rtsp://"):
            return "rtsp"
        if s.startswith("http://") or s.startswith("https://"):
            return "http"
        if s.startswith("/dev/") or s.isdigit():
            return "device"
        return "unknown"

    # ------------------------------------------------------------------
    # Flask app
    # ------------------------------------------------------------------
    def build_flask_app(self) -> Flask:
        app = Flask(__name__)
        CORS(app, origins=CORS_ORIGINS)
        srv = self

        @app.route("/")
        def dashboard():
            cams = srv.list_cameras()
            rows = "".join(
                f'<div style="display:inline-block;margin:12px;text-align:center">'
                f'<p style="margin:4px 0;font-weight:600">{c["label"]} '
                f'<span style="color:{"#2ecc71" if c["connected"] else "#e74c3c"}">'
                f'{"●" if c["connected"] else "○"}</span></p>'
                f'<img src="/stream/{c["id"]}" width="480" '
                f'style="border:2px solid #333;border-radius:6px"/>'
                f'<p style="font-size:12px;color:#888">'
                f'/stream/{c["id"]} &nbsp;|&nbsp; {c["fps"]} fps</p>'
                f'</div>'
                for c in cams
            )
            return (
                "<html><head><title>AI Stream Monitor</title>"
                "<meta http-equiv='refresh' content='30'/>"
                "<style>body{background:#111;color:#eee;font-family:sans-serif;"
                "padding:20px}h1{color:#0fb3bc}</style></head>"
                "<body>"
                f"<h1>AI Stream Monitor</h1>"
                f"<p>{len(cams)} camera(s) active &nbsp;|&nbsp; "
                f'<a href="/api/cameras" style="color:#0fb3bc">/api/cameras</a></p>'
                f'<div>{rows if rows else "<p>No cameras added yet. POST to /api/cameras</p>"}</div>'
                "</body></html>"
            )

        @app.route("/stream/<camera_id>")
        def stream(camera_id):
            try:
                srv.get_camera(camera_id)
            except KeyError:
                abort(404, description=f"Camera '{camera_id}' not found.")
            return Response(
                srv._mjpeg_gen(camera_id),
                mimetype="multipart/x-mixed-replace; boundary=frame",
            )

        @app.route("/snapshot/<camera_id>")
        def snapshot(camera_id):
            try:
                w = srv.get_camera(camera_id)
            except KeyError:
                abort(404, description=f"Camera '{camera_id}' not found.")
            jpeg = w.latest_jpeg
            if jpeg is None:
                abort(503, description="No frame available yet.")
            return Response(jpeg, mimetype="image/jpeg")

        @app.route("/api/health", methods=["GET"])
        def api_health():
            cams = srv.list_cameras()
            return jsonify({
                "status":            "ok",
                "cameras_total":     len(cams),
                "cameras_connected": sum(1 for c in cams if c["connected"]),
            })

        @app.route("/api/stream-sources", methods=["GET"])
        def api_stream_sources():
            """
            Returns every camera with stream_url and snapshot_url pre-built.
            Pass ?base=http://YOUR_SERVER_IP:5000 so the frontend embeds the
            correct external address in <img src> tags.
            If omitted the URL is inferred from the incoming request host.
            """
            base = request.args.get("base", "").rstrip("/")
            if not base:
                scheme = "https" if request.is_secure else "http"
                base   = f"{scheme}://{request.host}"

            sources = []
            for cam in srv.list_cameras():
                sources.append({
                    **cam,
                    "source_type":  srv._source_type(cam["source"]),
                    "stream_url":   f"{base}/stream/{cam['id']}",
                    "snapshot_url": f"{base}/snapshot/{cam['id']}",
                })
            return jsonify({"sources": sources})

        @app.route("/api/cameras", methods=["GET"])
        def api_list_cameras():
            return jsonify({"cameras": srv.list_cameras()})

        @app.route("/api/cameras", methods=["POST"])
        def api_add_camera():
            body      = request.get_json(silent=True) or {}
            camera_id = body.get("id", "").strip()
            source    = body.get("source")
            label     = body.get("label", camera_id)
            zone_raw  = body.get("zone")

            if not camera_id:
                return jsonify({"error": "Field 'id' is required."}), 400
            if source is None:
                return jsonify({"error": "Field 'source' is required (int index or URL string)."}), 400
            if isinstance(source, str) and source.isdigit():
                source = int(source)

            zone = tuple(zone_raw) if zone_raw else (100, 100, 400, 400)

            try:
                status = srv.add_camera(camera_id, source, label=label, zone=zone)
            except ValueError as exc:
                return jsonify({"error": str(exc)}), 409
            return jsonify({"camera": status}), 201

        @app.route("/api/cameras/<camera_id>", methods=["GET"])
        def api_get_camera(camera_id):
            try:
                return jsonify({"camera": srv.get_camera(camera_id).status()})
            except KeyError:
                return jsonify({"error": f"Camera '{camera_id}' not found."}), 404

        @app.route("/api/cameras/<camera_id>", methods=["DELETE"])
        def api_remove_camera(camera_id):
            try:
                srv.remove_camera(camera_id)
                return jsonify({"removed": camera_id})
            except KeyError:
                return jsonify({"error": f"Camera '{camera_id}' not found."}), 404

        @app.route("/api/events", methods=["GET"])
        def api_events():
            return jsonify({"events": list(srv._events)})

        @app.route("/api/events/<camera_id>", methods=["GET"])
        def api_events_for_camera(camera_id):
            evts = [e for e in srv._events if e.get("camera_id") == camera_id]
            return jsonify({"camera_id": camera_id, "events": evts})

        @app.route("/api/docs", methods=["GET"])
        def api_docs():
            return jsonify({
                "endpoints": [
                    {"method": "GET",    "path": "/",
                     "description": "HTML dashboard with live streams"},
                    {"method": "GET",    "path": "/stream/<id>",
                     "description": "MJPEG stream for camera <id>"},
                    {"method": "GET",    "path": "/snapshot/<id>",
                     "description": "Single JPEG snapshot"},
                    {"method": "GET",    "path": "/api/health",
                     "description": "Server health + camera counts"},
                    {"method": "GET",    "path": "/api/stream-sources",
                     "description": "All cameras with stream/snapshot URLs pre-built",
                     "params": {"base": "Base URL to embed (optional, auto-detected if omitted)"}},
                    {"method": "GET",    "path": "/api/cameras",
                     "description": "List all cameras"},
                    {"method": "POST",   "path": "/api/cameras",
                     "description": "Add a camera",
                     "body": {
                         "id":     "string (required) — unique slug",
                         "source": "int | string (required) — see source_formats",
                         "label":  "string (optional)",
                         "zone":   "[x, y, w, h] ints (optional, default [100,100,400,400])",
                     }},
                    {"method": "GET",    "path": "/api/cameras/<id>",
                     "description": "Single camera status"},
                    {"method": "DELETE", "path": "/api/cameras/<id>",
                     "description": "Stop and remove a camera"},
                    {"method": "GET",    "path": "/api/events",
                     "description": f"Last {MAX_EVENTS} activity events (all cameras)"},
                    {"method": "GET",    "path": "/api/events/<id>",
                     "description": "Events filtered by camera id"},
                    {"method": "GET",    "path": "/api/docs",
                     "description": "This reference"},
                ],
                "source_formats": {
                    "usb":    "0  (integer index; 1, 2 for additional USB cameras)",
                    "rtsp":   "rtsp://user:pass@192.168.0.10:554/stream",
                    "http":   "http://192.168.0.10/video.mjpg",
                    "device": "/dev/video0  (Linux v4l2)",
                },
            })

        return app

    def run(self, host: str = SERVER_HOST, port: int = SERVER_PORT):
        app = self.build_flask_app()
        log.info("Starting stream server on http://%s:%d", host, port)
        app.run(host=host, port=port, threaded=True, use_reloader=False)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    server = StreamingServer()

    # -----------------------------------------------------------------------
    # Auto-start cameras from environment variable (optional convenience)
    #
    # Format: id:source,id2:source2,...
    # Example:
    #   INIT_CAMERAS=laptop:0,cam1:rtsp://admin:pass@192.168.0.101:554/stream \
    #       python stream_server.py
    # -----------------------------------------------------------------------
    init_env = os.getenv("INIT_CAMERAS", "")
    if init_env:
        for entry in init_env.split(","):
            entry = entry.strip()
            if ":" not in entry:
                continue
            cam_id, _, cam_src = entry.partition(":")
            cam_id  = cam_id.strip()
            cam_src = cam_src.strip()
            src = int(cam_src) if cam_src.isdigit() else cam_src
            try:
                server.add_camera(cam_id, src)
                log.info("Auto-started camera: %s -> %s", cam_id, cam_src)
            except Exception as exc:
                log.warning("Failed to auto-start %s: %s", cam_id, exc)

    server.run()