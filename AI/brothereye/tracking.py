import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


class OscillationCycleCounter:
    """Counts wrist-reversal cycles from a stream of (x, y) positions."""

    def __init__(self, reversals_per_cycle: int = 4, min_delta_px: float = 1.5):
        self._rpc   = reversals_per_cycle
        self._delta = min_delta_px
        self._count = 0.0
        self._total = 0
        self._prev_x = self._prev_y = None
        self._prev_dx = self._prev_dy = 0.0
        self._new_ts: list[float] = []

    def update(self, x: float, y: float, ts: float) -> int:
        if self._prev_x is None:
            self._prev_x, self._prev_y = x, y
            return 0
        dx, dy = x - self._prev_x, y - self._prev_y
        new = 0
        if abs(dx) > self._delta and abs(self._prev_dx) > self._delta:
            if dx * self._prev_dx < 0:
                self._count += 1.0
        if abs(dy) > self._delta and abs(self._prev_dy) > self._delta:
            if dy * self._prev_dy < 0:
                self._count += 0.5
        while self._count >= self._rpc:
            self._count -= self._rpc
            self._total += 1
            self._new_ts.append(ts)
            new += 1
        self._prev_x, self._prev_y   = x, y
        self._prev_dx, self._prev_dy = dx, dy
        return new

    @property
    def cycles(self) -> int:
        return self._total

    def pop_new_timestamps(self) -> list[float]:
        out, self._new_ts = list(self._new_ts), []
        return out

    def reset(self) -> None:
        self._count = 0.0
        self._total = 0
        self._prev_x = self._prev_y = None
        self._prev_dx = self._prev_dy = 0.0
        self._new_ts.clear()


class ActionDurationTracker:
    """Fires a completion event when an action is sustained for long enough."""

    def __init__(self, min_duration_s: float = 3.0, end_gap_s: float = 1.5):
        self._min    = min_duration_s
        self._gap    = end_gap_s
        self._active: Optional[str] = None
        self._start  = self._last = 0.0
        self._counts: dict[str, int] = {}

    def update(self, action: str, ts: float) -> Optional[dict]:
        if self._active is None:
            self._active = action
            self._start  = self._last = ts
            return {"type": "action_start", "action": action, "ts": ts}

        if action == self._active:
            self._last = ts
            return None

        if ts - self._last < self._gap:
            return None

        duration = self._last - self._start
        event    = None
        if duration >= self._min:
            self._counts[self._active] = self._counts.get(self._active, 0) + 1
            event = {
                "type":        "action_complete",
                "action":      self._active,
                "ts":          self._last,
                "duration_s":  round(duration, 2),
                "cycle_count": self._counts[self._active],
            }
        self._active = action
        self._start  = self._last = ts
        return event

    @property
    def counts(self) -> dict[str, int]:
        return dict(self._counts)


class WorkflowTracker:
    """Ordered state machine that fires events as production steps complete."""

    IDLE_RESET_S = 180.0

    def __init__(self, steps: list[str], min_step_s: float = 3.0):
        if not steps:
            raise ValueError("steps list cannot be empty")
        self._steps    = list(steps)
        self._min      = min_step_s
        self._n_cycles = 0
        self._history: list[dict] = []
        self._reset(time.time())

    def update(self, action: str, ts: float) -> Optional[dict]:
        self._last_ts = ts

        idle_too_long = (
            self._wf_start is not None
            and action not in self._steps
            and ts - self._last_rel > self.IDLE_RESET_S
        )
        if idle_too_long:
            ev = {"type": "workflow_reset", "reason": "idle_timeout", "ts": ts}
            self._reset(ts)
            return ev

        if action in self._steps:
            self._last_rel = ts

        expected = self._steps[self._idx]
        if action != expected:
            self._active   = False
            self._step_ts  = 0.0
            return None

        if not self._active:
            self._active  = True
            self._step_ts = ts
            if self._wf_start is None and self._idx == 0:
                self._wf_start = ts

        if ts - self._step_ts < self._min:
            return None

        step_ev = {
            "type":       "step_complete",
            "step":       expected,
            "step_idx":   self._idx,
            "duration_s": round(ts - self._step_ts, 2),
            "ts":         ts,
        }
        self._done.append(step_ev)
        self._idx  += 1
        self._active  = False
        self._step_ts = 0.0

        if self._idx < len(self._steps):
            return step_ev

        self._n_cycles += 1
        wf_ev = {
            "type":        "workflow_complete",
            "steps":       [s["step"] for s in self._done],
            "duration_s":  round(ts - (self._wf_start or ts), 2),
            "start_ts":    self._wf_start,
            "end_ts":      ts,
            "ts":          ts,
            "cycle_count": self._n_cycles,
        }
        self._history.append(wf_ev)
        self._reset(ts)
        return wf_ev

    def status(self) -> dict:
        return {
            "steps":        self._steps,
            "current_step": (self._steps[self._idx]
                             if self._idx < len(self._steps) else "complete"),
            "step_index":   self._idx,
            "total_steps":  len(self._steps),
            "progress":     round(self._idx / len(self._steps), 2),
            "cycle_count":  self._n_cycles,
            "wf_start":     (datetime.fromtimestamp(self._wf_start, tz=timezone.utc)
                             .isoformat() if self._wf_start else None),
        }

    @property
    def cycle_count(self) -> int:
        return self._n_cycles

    @property
    def steps(self) -> list[str]:
        return list(self._steps)

    def history(self) -> list[dict]:
        return list(self._history)

    def _reset(self, ts: float) -> None:
        self._idx      = 0
        self._active   = False
        self._step_ts  = 0.0
        self._wf_start: Optional[float] = None
        self._last_ts  = self._last_rel = ts
        self._done: list[dict] = []


class WorkflowLearner:
    """Watches a reference video and extracts the production-step sequence."""

    def __init__(self, tool_model, pose_model,
                 sample_every: int = 6, min_segment_s: float = 1.5):
        self._tool   = tool_model
        self._pose   = pose_model
        self._every  = sample_every
        self._min_s  = min_segment_s

    def learn(self, video_path: str) -> tuple[list[str], list[dict]]:
        import cv2
        cap = cv2.VideoCapture(str(video_path))
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        raw: list[tuple[float, str]] = []
        fn  = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if fn % self._every == 0:
                raw.append((fn / fps, self._label_frame(frame)))
            fn += 1
        cap.release()
        return ([], []) if not raw else self._consolidate(raw)

    def _label_frame(self, frame) -> str:
        import cv2
        import numpy as np
        H, W = frame.shape[:2]
        cx, cy, half = W * 0.5, H * 0.65, min(W, H) // 3
        try:
            res = self._pose.predict(frame, verbose=False, conf=0.25, classes=[0])
            r   = res[0]
            if r.boxes is not None and len(r.boxes) > 0:
                boxes = r.boxes.xyxy.cpu().numpy()
                best  = int(np.argmax(
                    [(b[2]-b[0])*(b[3]-b[1]) for b in boxes]
                ))
                b  = boxes[best]
                ph = max(1, int(b[3] - b[1]))
                if r.keypoints is not None and r.keypoints.conf is not None:
                    kxy  = r.keypoints.xy.cpu().numpy()[best]
                    kcon = r.keypoints.conf.cpu().numpy()[best]
                    wpts = [(kxy[i][0], kxy[i][1])
                            for i in [9, 10] if float(kcon[i]) >= 0.30]
                    if wpts:
                        cx   = sum(p[0] for p in wpts) / len(wpts)
                        cy   = sum(p[1] for p in wpts) / len(wpts)
                        half = max(40, int(ph * 0.32))
                    else:
                        cx, cy = (b[0]+b[2])/2, b[1]+ph*0.73
                        half   = max(40, int(ph * 0.27))
        except Exception:
            pass
        crop = frame[max(0, int(cy-half)):min(H, int(cy+half)),
                     max(0, int(cx-half)):min(W, int(cx+half))]
        if crop.size == 0:
            crop = frame
        try:
            r2 = self._tool.predict(
                cv2.resize(crop, (128, 128)), verbose=False)
            if r2 and r2[0].probs is not None:
                return r2[0].names[int(r2[0].probs.top1)]
        except Exception:
            pass
        return "unknown"

    def _consolidate(self, raw: list[tuple[float, str]]) -> tuple[list[str], list[dict]]:
        segs: list[dict] = []
        s_ts, s_lbl, e_ts = raw[0][0], raw[0][1], raw[0][0]
        for ts, lbl in raw[1:]:
            if lbl == s_lbl:
                e_ts = ts
            else:
                segs.append({"label": s_lbl, "s": s_ts, "e": e_ts, "d": e_ts - s_ts})
                s_ts, s_lbl, e_ts = ts, lbl, ts
        segs.append({"label": s_lbl, "s": s_ts, "e": e_ts, "d": e_ts - s_ts})

        segs = [s for s in segs if s["d"] >= self._min_s and s["label"] != "unknown"]

        merged: list[dict] = []
        for s in segs:
            if merged and merged[-1]["label"] == s["label"]:
                merged[-1]["e"] = s["e"]
                merged[-1]["d"] += s["d"]
            else:
                merged.append(dict(s))

        seen:  set[str]  = set()
        steps: list[str] = []
        for s in merged:
            if s["label"] not in seen:
                seen.add(s["label"])
                steps.append(s["label"])

        timings = [
            {"step": s["label"], "start_s": round(s["s"], 2),
             "end_s": round(s["e"], 2), "duration_s": round(s["d"], 2)}
            for s in merged
        ]
        return steps, timings


def save_workflow(camera_id: str, steps: list[str], directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f"{camera_id}.json").write_text(
        json.dumps({"steps": steps}), encoding="utf-8")


def load_workflow(camera_id: str, directory: Path) -> Optional[list[str]]:
    p = directory / f"{camera_id}.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8")).get("steps")
    except Exception:
        return None
