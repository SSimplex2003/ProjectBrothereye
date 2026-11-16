import logging
import os
import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Optional

import cv2
import numpy as np

from brothereye import config as cfg
from brothereye.database import PgWriter
from brothereye.detection import (
    ActionFrameClassifier, ScrewingDetector, ToolClassifier, WristMotionTracker,
    bbox_iou, blur_box, blur_by_mask, clamp,
    draw_skeleton, extract_people, fallback_label,
    feather_mask, hands_height, head_direction,
    movement_speed, posture,
)
from brothereye.tracking import (
    ActionDurationTracker, OscillationCycleCounter,
    WorkflowTracker, load_workflow, save_workflow,
)

log = logging.getLogger(__name__)


class ActionSegmenter:
    """Smooths a noisy per-frame label stream into stable start/end events."""

    def __init__(self, start_n: int = 3, end_m: int = 3,
                 conf_start: float = 0.70, conf_end: float = 0.45):
        self.start_n     = start_n
        self.end_m       = end_m
        self.conf_start  = conf_start
        self.conf_end    = conf_end
        self.active_label      = None
        self.active_start_ts   = None
        self._hi = self._lo    = 0

    def update(self, label: str, conf: float, ts: float) -> tuple:
        if self.active_label is None:
            if label != "other" and conf >= self.conf_start:
                self._hi += 1
                if self._hi >= self.start_n:
                    self.active_label    = label
                    self.active_start_ts = ts
                    self._hi = self._lo  = 0
            else:
                self._hi = 0
            return None, None

        if label == self.active_label and conf >= self.conf_end:
            self._lo = 0
        else:
            self._lo += 1
            if self._lo >= self.end_m:
                dur      = ts - self.active_start_ts
                finished = {"label": self.active_label,
                            "start_ts": self.active_start_ts,
                            "end_ts": ts, "duration_s": dur}
                self.active_label = self.active_start_ts = None
                self._lo = self._hi = 0
                return finished, None

        return None, {"label": self.active_label,
                      "start_ts": self.active_start_ts,
                      "elapsed_s": ts - self.active_start_ts}


class CameraWorker:
    """Manages one camera: capture → AI inference → JPEG encoding."""

    def __init__(self, camera_id: str, source,
                 label: str = "",
                 zone: tuple = (100, 100, 400, 400),
                 pose_model=None, seg_model=None,
                 action_classifier: Optional[ActionFrameClassifier] = None,
                 tool_classifier: Optional[ToolClassifier] = None,
                 workflow_steps: Optional[list] = None,
                 pg: Optional[PgWriter] = None,
                 n8n_session=None,
                 event_log: Optional[deque] = None):

        self.camera_id          = camera_id
        self.source             = source
        self.label              = label or camera_id
        self.zone               = zone
        self.pose_model         = pose_model
        self.seg_model          = seg_model
        self.action_classifier  = action_classifier
        self.tool_classifier    = tool_classifier
        self.pg                 = pg
        self.n8n_session        = n8n_session
        self.event_log          = event_log

        self._jpeg      = None
        self._jpeg_lock = threading.Lock()
        self._stop_evt  = threading.Event()
        self._thread    = threading.Thread(
            target=self._run, daemon=True, name=f"cam-{camera_id}")

        self._screw_detector = ScrewingDetector()
        self._wrist_trackers: dict = {}
        self._segmenters:     dict = {}
        self._dur_trackers:   dict = {}
        self._osc_counters:   dict = {}
        self._cycle_counts:   dict = {}
        self._last_centers:   dict = {}
        self._worker_state:   dict = {}
        self._track_to_op:    dict = {}
        self._next_op       = [1]
        self._frame_count   = 0
        self._last_n8n_ts   = 0.0

        self.workflow_tracker: Optional[WorkflowTracker] = None
        self._workflow_events: list = []
        self._workflow_steps:  list = []
        if workflow_steps:
            self.set_workflow(workflow_steps)

        self.fps_actual = 0.0
        self.connected  = False
        self.error      = ""
        self.started_at = datetime.now(timezone.utc).isoformat()

    @property
    def latest_jpeg(self) -> Optional[bytes]:
        with self._jpeg_lock:
            return self._jpeg

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
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

    def set_workflow(self, steps: list, min_step_s: float = 3.0) -> None:
        self._workflow_steps  = list(steps)
        self.workflow_tracker = WorkflowTracker(steps, min_step_s)
        log.info("[%s] Workflow configured: %s", self.camera_id, steps)

    def cycle_status(self) -> dict:
        return {
            "camera_id":     self.camera_id,
            "cycle_counts":  dict(self._cycle_counts),
            "workflow":      self.workflow_tracker.status()
                             if self.workflow_tracker else {},
            "recent_events": self._workflow_events[-20:],
        }

    def _open_capture(self) -> cv2.VideoCapture:
        src = self.source
        if isinstance(src, int) or (isinstance(src, str) and src.isdigit()):
            return cv2.VideoCapture(int(src))
        if isinstance(src, str) and src.startswith("rtsp://"):
            os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
                "rtsp_transport;tcp|stimeout;3000000|max_delay;0"
                if cfg.RTSP_FORCE_TCP
                else "stimeout;3000000|max_delay;0"
            )
            cap = cv2.VideoCapture(src, cv2.CAP_FFMPEG)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, cfg.RTSP_BUFFER_SIZE)
            return cap
        return cv2.VideoCapture(src)

    def _grab(self, cap: cv2.VideoCapture) -> tuple:
        if not cfg.DROP_OLD_FRAMES:
            return cap.read()
        ok = False
        for _ in range(3):
            ok = cap.grab()
            if not ok:
                break
        return cap.retrieve() if ok else cap.read()

    def _run(self) -> None:
        log.info("[%s] Starting (source=%s)", self.camera_id, self.source)
        cap      = None
        backoff  = 2.0
        while not self._stop_evt.is_set():
            if cap is None or not cap.isOpened():
                try:
                    if cap:
                        cap.release()
                    cap = self._open_capture()
                    if not cap.isOpened():
                        raise RuntimeError("VideoCapture did not open")
                    self.connected = True
                    self.error     = ""
                    log.info("[%s] Connected", self.camera_id)
                    backoff = 2.0
                except Exception as exc:
                    self.connected = False
                    self.error     = str(exc)
                    log.warning("[%s] Reconnect in %.0fs — %s",
                                self.camera_id, backoff, exc)
                    time.sleep(backoff)
                    backoff = min(backoff * 2, 30.0)
                    continue

            t0        = time.time()
            ok, frame = self._grab(cap)
            if not ok or frame is None:
                self.connected = False
                self.error     = "Frame grab failed"
                cap.release()
                cap = None
                continue

            try:
                annotated, events = self._process(frame)
                ok2, buf = cv2.imencode(
                    ".jpg", annotated,
                    [cv2.IMWRITE_JPEG_QUALITY, cfg.JPEG_QUALITY])
                if ok2:
                    with self._jpeg_lock:
                        self._jpeg = buf.tobytes()
            except Exception as exc:
                log.error("[%s] Processing error: %s", self.camera_id, exc)
                continue

            elapsed = max(1e-6, time.time() - t0)
            self.fps_actual = 0.9 * self.fps_actual + 0.1 / elapsed

            if (cfg.N8N_ENABLED and self.n8n_session and events
                    and (time.time() - self._last_n8n_ts) >= cfg.SEND_EVERY_SEC):
                for ev in events:
                    try:
                        self.n8n_session.post(cfg.N8N_URL, json=ev, timeout=3)
                    except Exception:
                        pass
                self._last_n8n_ts = time.time()

        if cap:
            cap.release()
        log.info("[%s] Stopped", self.camera_id)

    def _process(self, frame: np.ndarray) -> tuple:
        h, w            = frame.shape[:2]
        self._frame_count += 1
        zx, zy, zw, zh = self.zone
        now             = time.time()
        now_iso         = datetime.now(timezone.utc).isoformat()

        pose_results = self.pose_model.track(
            frame, persist=True, verbose=False,
            conf=cfg.POSE_CONF, iou=cfg.POSE_IOU, device=cfg.DEVICE)
        people = extract_people(pose_results[0])

        seg_results = self.seg_model.predict(
            frame, verbose=False, conf=cfg.SEG_CONF,
            classes=[0], device=cfg.DEVICE)
        s0 = seg_results[0]
        seg_boxes, seg_masks = [], []
        if s0.boxes is not None and len(s0.boxes) > 0 and s0.masks is not None:
            for i, row in enumerate(s0.boxes.xyxy.cpu().numpy()):
                seg_boxes.append(tuple(row.tolist()))
                mask = s0.masks.data[i].cpu().numpy().astype(np.float32)
                seg_masks.append(cv2.resize(mask, (w, h)) > cfg.SEG_MASK_THRESH)

        cv2.rectangle(frame, (zx, zy), (zx+zw, zy+zh), (255, 0, 0), 2)
        cv2.putText(frame, self.label, (zx+4, zy-8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 0, 0), 1)

        all_events = []

        for person in people:
            tid             = person["id"]
            x1, y1, x2, y2 = person["bbox"]
            kpts            = person["kpts"]

            if tid not in self._track_to_op:
                self._track_to_op[tid] = f"{self.camera_id}_Op{self._next_op[0]}"
                self._next_op[0] += 1
            op_name = self._track_to_op[tid]

            if tid not in self._segmenters:
                self._segmenters[tid] = ActionSegmenter()

            best_iou, best_mask = 0.0, None
            for sb, sm in zip(seg_boxes, seg_masks):
                iou = bbox_iou((x1, y1, x2, y2), sb)
                if iou > best_iou:
                    best_iou, best_mask = iou, sm
            if best_mask is not None and best_iou >= 0.15:
                blur_by_mask(frame,
                             feather_mask(best_mask, k=cfg.MASK_FEATHER),
                             k=cfg.BLUR_K)
            else:
                blur_box(frame, x1, y1, x2, y2, k=cfg.BLUR_K)

            cx, cy  = (x1+x2)/2.0, (y1+y2)/2.0
            in_zone = (zx < cx < zx+zw) and (zy < cy < zy+zh)
            speed   = movement_speed(
                (self.camera_id, tid), cx, cy, now, self._last_centers)

            ix1 = clamp(int(x1), 0, w-1);  iy1 = clamp(int(y1), 0, h-1)
            ix2 = clamp(int(x2), 0, w-1);  iy2 = clamp(int(y2), 0, h-1)

            hand_crop   = None
            person_crop = None
            if ix2 > ix1 and iy2 > iy1:
                ph       = iy2 - iy1
                hand_y1  = max(iy1, iy2 - int(ph * 0.35))
                hand_crop = frame[hand_y1:iy2, ix1:ix2].copy()
                person_crop = frame[iy1:iy2, ix1:ix2].copy()

            tool_label, tool_conf = None, 0.0
            if (self.tool_classifier is not None
                    and hand_crop is not None
                    and hand_crop.size > 0
                    and self._frame_count % cfg.TOOL_INFER_EVERY == 0):
                try:
                    tool_label, tool_conf = self.tool_classifier.predict(hand_crop)
                except Exception:
                    pass

            tracker      = self._wrist_trackers.setdefault(tid, WristMotionTracker())
            motion_feats = tracker.update(kpts)
            motion_label, motion_conf = self._screw_detector.classify(
                motion_feats, hand_crop=hand_crop)

            action_label, action_conf = None, None
            if (self.action_classifier is not None
                    and person_crop is not None
                    and person_crop.size > 0
                    and self._frame_count % cfg.ACTION_INFER_EVERY == 0):
                try:
                    action_label, action_conf = self.action_classifier.predict(person_crop)
                except Exception:
                    pass

            if tool_label is not None and tool_conf >= cfg.TOOL_CONF_MIN:
                action, conf = tool_label, tool_conf
            else:
                action, conf = self._screw_detector.fuse(
                    motion_label, motion_conf, action_label, action_conf)

            if action in ("unknown",):
                action = fallback_label(
                    head_direction(kpts), hands_height(kpts),
                    posture(kpts), speed, in_zone)
                conf = 0.55

            dur_tracker = self._dur_trackers.setdefault(
                tid, ActionDurationTracker(min_duration_s=3.0, end_gap_s=1.5))
            cycle_ev = dur_tracker.update(action, now)
            if cycle_ev and cycle_ev["type"] == "action_complete":
                counts = self._cycle_counts.setdefault(op_name, {})
                counts[action] = cycle_ev["cycle_count"]
                if self.pg:
                    self.pg.insert_cycle(
                        self.camera_id, op_name, action,
                        cycle_ev["cycle_count"], cycle_ev["duration_s"], now_iso)
                tagged = {**cycle_ev, "camera_id": self.camera_id,
                          "worker_name": op_name, "event_time": now_iso}
                self._workflow_events.append(tagged)
                if self.event_log is not None:
                    self.event_log.append(tagged)

            if action == "screwing" and kpts:
                wrist = (_kpt(kpts, 9) or _kpt(kpts, 10))
                if wrist:
                    osc = self._osc_counters.setdefault(
                        tid, OscillationCycleCounter())
                    osc.update(wrist[0], wrist[1], now)

            if self.workflow_tracker is not None:
                wf_ev = self.workflow_tracker.update(action, now)
                if wf_ev is not None:
                    import json as _json
                    wf_ev["camera_id"]  = self.camera_id
                    wf_ev["event_time"] = now_iso
                    self._workflow_events.append(wf_ev)
                    if self.event_log is not None:
                        self.event_log.append(wf_ev)
                    if wf_ev["type"] == "workflow_complete" and self.pg:
                        self.pg.insert_workflow(
                            self.camera_id,
                            _json.dumps(wf_ev["steps"]),
                            wf_ev["duration_s"],
                            datetime.fromtimestamp(
                                wf_ev["start_ts"], tz=timezone.utc).isoformat(),
                            now_iso,
                            wf_ev["cycle_count"])
                    log.info("[%s] %s", self.camera_id, wf_ev["type"])

            finished, active = self._segmenters[tid].update(action, float(conf), now)
            self._pg_track(op_name, action, now_iso)

            ev = {"camera_id": self.camera_id, "worker_name": op_name,
                  "activity_type": action, "confidence": round(float(conf), 3),
                  "event_time": now_iso}
            all_events.append(ev)
            if self.event_log is not None:
                self.event_log.append(ev)

            if finished and self.pg:
                start_iso = datetime.fromtimestamp(
                    finished["start_ts"], tz=timezone.utc).isoformat()
                self.pg.insert_activity(
                    op_name, finished["label"],
                    round(finished["duration_s"] / 60.0, 2),
                    start_iso, now_iso)

            colour  = cfg.ACTION_COLOURS.get(action, cfg.DEFAULT_COLOUR)
            cv2.rectangle(frame,
                          (int(x1), int(y1)), (int(x2), int(y2)),
                          colour, 2)
            draw_skeleton(frame, kpts)
            label_txt = f"{op_name}  {action}  {conf:.2f}"
            if active:
                label_txt += f"  {active['elapsed_s']:.1f}s"
            cv2.putText(frame, label_txt,
                        (int(x1), max(20, int(y1) - 10)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        return frame, all_events

    def _pg_track(self, op_name: str, action: str, now_iso: str) -> None:
        if self.pg is None:
            return
        state = self._worker_state.get(op_name)
        if state is None:
            self._worker_state[op_name] = {"activity": action, "start": now_iso}
            self.pg.upsert_state(op_name, action, now_iso, now_iso)
            return
        if state["activity"] == action:
            self.pg.upsert_state(op_name, action, state["start"], now_iso)
            return
        start_dt = datetime.fromisoformat(state["start"])
        end_dt   = datetime.fromisoformat(now_iso)
        dur_min  = max(0.0, (end_dt - start_dt).total_seconds() / 60.0)
        self.pg.insert_activity(
            op_name, state["activity"], round(dur_min, 2),
            state["start"], now_iso)
        self._worker_state[op_name] = {"activity": action, "start": now_iso}
        self.pg.upsert_state(op_name, action, now_iso, now_iso)


def _kpt(kpts, idx):
    return kpts[idx] if (kpts and len(kpts) > idx and kpts[idx] is not None) else None
