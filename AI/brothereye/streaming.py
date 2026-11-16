import logging
import os
import time
from collections import deque
from pathlib import Path
from typing import Optional

import requests
from flask import Flask, Response, abort, jsonify, request
from flask_cors import CORS
from ultralytics import YOLO

from brothereye import config as cfg
from brothereye.camera import CameraWorker
from brothereye.database import PgWriter
from brothereye.detection import ActionFrameClassifier, ToolClassifier
from brothereye.tracking import WorkflowLearner, load_workflow, save_workflow

log = logging.getLogger(__name__)


class StreamingServer:
    """Orchestrates cameras, models and the Flask HTTP API."""

    def __init__(self):
        log.info("Device: %s", cfg.DEVICE.upper())

        self.pose_model = YOLO(cfg.POSE_MODEL)
        self.pose_model.to(cfg.DEVICE)

        self.seg_model = YOLO(cfg.SEG_MODEL)
        self.seg_model.to(cfg.DEVICE)

        self.action_classifier: Optional[ActionFrameClassifier] = None
        if cfg.ACTION_ENABLED and Path(cfg.ACTION_MODEL).exists():
            try:
                action_yolo = YOLO(cfg.ACTION_MODEL)
                action_yolo.to(cfg.DEVICE)
                self.action_classifier = ActionFrameClassifier(
                    action_yolo, device=cfg.DEVICE)
                log.info("Action classifier ready on %s", cfg.DEVICE.upper())
            except Exception as exc:
                log.warning("Action classifier skipped (%s) — heuristic fallback only.", exc)
        else:
            log.info("Action classifier not trained yet — "
                     "run training/collect_action_frames.py then training/train_action_classifier.py")

        self.tool_classifier: Optional[ToolClassifier] = None
        if Path(cfg.TOOL_MODEL).exists():
            tool_yolo = YOLO(cfg.TOOL_MODEL)
            tool_yolo.to(cfg.DEVICE)
            self.tool_classifier = ToolClassifier(tool_yolo, device=cfg.DEVICE)
            log.info("Tool classifier ready on %s", cfg.DEVICE.upper())
        else:
            log.info("Tool classifier not trained yet — "
                     "run training/collect_crops.py then training/train_classifier.py")

        self.pg: Optional[PgWriter] = None
        if cfg.PG_ENABLED:
            self.pg = PgWriter(cfg.PG_DSN)
            log.info("Postgres logging enabled.")

        self.n8n_session = requests.Session() if cfg.N8N_ENABLED else None
        self._cameras: dict[str, CameraWorker] = {}
        self._cam_lock = __import__("threading").Lock()
        self._events: deque = deque(maxlen=cfg.MAX_EVENTS)

    def add_camera(self, camera_id: str, source,
                   label: str = "",
                   zone: Optional[tuple] = None,
                   workflow_steps: Optional[list] = None) -> dict:
        with self._cam_lock:
            if camera_id in self._cameras:
                raise ValueError(f"Camera '{camera_id}' already exists.")
            if workflow_steps is None:
                workflow_steps = load_workflow(camera_id, cfg.WORKFLOW_DIR)
                if workflow_steps:
                    log.info("Restored workflow for %s: %s",
                             camera_id, workflow_steps)
            worker = CameraWorker(
                camera_id       = camera_id,
                source          = source,
                label           = label or camera_id,
                zone            = zone,
                pose_model        = self.pose_model,
                seg_model         = self.seg_model,
                action_classifier = self.action_classifier,
                tool_classifier   = self.tool_classifier,
                workflow_steps    = workflow_steps,
                pg              = self.pg,
                n8n_session     = self.n8n_session,
                event_log       = self._events,
            )
            worker.start()
            self._cameras[camera_id] = worker
        log.info("Camera added: %s (source=%s)", camera_id, source)
        return worker.status()

    def remove_camera(self, camera_id: str) -> None:
        with self._cam_lock:
            worker = self._cameras.pop(camera_id, None)
        if worker is None:
            raise KeyError(f"Camera '{camera_id}' not found.")
        worker.stop()
        log.info("Camera removed: %s", camera_id)

    def get_camera(self, camera_id: str) -> CameraWorker:
        with self._cam_lock:
            worker = self._cameras.get(camera_id)
        if worker is None:
            raise KeyError(f"Camera '{camera_id}' not found.")
        return worker

    def list_cameras(self) -> list[dict]:
        with self._cam_lock:
            return [w.status() for w in self._cameras.values()]

    def run(self, host: str = cfg.HOST, port: int = cfg.PORT) -> None:
        app = self._build_app()
        log.info("Server starting on http://%s:%d", host, port)
        app.run(host=host, port=port, threaded=True, use_reloader=False)

    def _mjpeg_gen(self, camera_id: str):
        boundary = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
        while True:
            try:
                worker = self.get_camera(camera_id)
            except KeyError:
                break
            jpeg = worker.latest_jpeg
            if jpeg:
                yield boundary + jpeg + b"\r\n"
            time.sleep(cfg.FRAME_SLEEP)

    @staticmethod
    def _source_type(src) -> str:
        if isinstance(src, int):           return "usb"
        s = str(src)
        if s.startswith("rtsp://"):        return "rtsp"
        if s.startswith(("http://","https://")): return "http"
        return "device"

    def _build_app(self) -> Flask:
        app = Flask(__name__)
        CORS(app, origins=cfg.CORS_ORIGINS)
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
            tool_status = "✓ loaded" if srv.tool_classifier else "✗ not trained"
            action_status = "✓ loaded" if srv.action_classifier else "✗ not trained"
            db_status   = "✓ connected" if cfg.PG_ENABLED  else "✗ disabled"
            return (
                "<html><head><title>Brothereye</title>"
                "<meta http-equiv='refresh' content='30'/>"
                "<style>body{background:#111;color:#eee;font-family:sans-serif;"
                "padding:20px}h1{color:#0fb3bc}p{color:#aaa}</style></head>"
                "<body>"
                f"<h1>Brothereye — AI Stream Monitor</h1>"
                f"<p>{len(cams)} camera(s) &nbsp;|&nbsp; "
                f"Tool: {tool_status} &nbsp;|&nbsp; "
                f"Action: {action_status} &nbsp;|&nbsp; "
                f"DB: {db_status}</p>"
                f'<div>{rows or "<p>No cameras. POST to /api/cameras</p>"}</div>'
                "</body></html>"
            )

        @app.route("/stream/<camera_id>")
        def stream(camera_id):
            try:
                srv.get_camera(camera_id)
            except KeyError:
                abort(404)
            return Response(
                srv._mjpeg_gen(camera_id),
                mimetype="multipart/x-mixed-replace; boundary=frame")

        @app.route("/snapshot/<camera_id>")
        def snapshot(camera_id):
            try:
                w = srv.get_camera(camera_id)
            except KeyError:
                abort(404)
            jpeg = w.latest_jpeg
            if jpeg is None:
                abort(503)
            return Response(jpeg, mimetype="image/jpeg")

        @app.route("/api/health")
        def api_health():
            cams = srv.list_cameras()
            return jsonify({
                "status":            "ok",
                "cameras_total":     len(cams),
                "cameras_connected": sum(1 for c in cams if c["connected"]),
                "db_enabled":        cfg.PG_ENABLED,
                "tool_classifier":   srv.tool_classifier is not None,
                "action_classifier": srv.action_classifier is not None,
            })

        @app.route("/api/stream-sources")
        def api_stream_sources():
            base = request.args.get("base", "").rstrip("/") or \
                   f"{'https' if request.is_secure else 'http'}://{request.host}"
            return jsonify({"sources": [
                {**c,
                 "source_type":  srv._source_type(c["source"]),
                 "stream_url":   f"{base}/stream/{c['id']}",
                 "snapshot_url": f"{base}/snapshot/{c['id']}"}
                for c in srv.list_cameras()
            ]})

        @app.route("/api/cameras", methods=["GET"])
        def api_cameras_list():
            return jsonify({"cameras": srv.list_cameras()})

        @app.route("/api/cameras", methods=["POST"])
        def api_cameras_add():
            body      = request.get_json(silent=True) or {}
            camera_id = body.get("id", "").strip()
            source    = body.get("source")
            label     = body.get("label", camera_id)
            zone      = tuple(body["zone"]) if body.get("zone") else None
            steps     = body.get("workflow_steps")
            if not camera_id:
                return jsonify({"error": "'id' required"}), 400
            if source is None:
                return jsonify({"error": "'source' required"}), 400
            if isinstance(source, str) and source.isdigit():
                source = int(source)
            try:
                status = srv.add_camera(camera_id, source,
                                        label=label, zone=zone,
                                        workflow_steps=steps)
            except ValueError as exc:
                return jsonify({"error": str(exc)}), 409
            return jsonify({"camera": status}), 201

        @app.route("/api/cameras/<camera_id>", methods=["GET"])
        def api_camera_get(camera_id):
            try:
                return jsonify({"camera": srv.get_camera(camera_id).status()})
            except KeyError:
                return jsonify({"error": "not found"}), 404

        @app.route("/api/cameras/<camera_id>", methods=["DELETE"])
        def api_camera_delete(camera_id):
            try:
                srv.remove_camera(camera_id)
                return jsonify({"removed": camera_id})
            except KeyError:
                return jsonify({"error": "not found"}), 404

        @app.route("/api/events")
        def api_events():
            return jsonify({"events": list(srv._events)})

        @app.route("/api/events/<camera_id>")
        def api_events_camera(camera_id):
            evts = [e for e in srv._events if e.get("camera_id") == camera_id]
            return jsonify({"camera_id": camera_id, "events": evts})

        @app.route("/api/screwing")
        def api_screwing():
            seen: dict = {}
            for ev in reversed(list(srv._events)):
                if ev.get("activity_type") == "screwing":
                    key = (ev.get("camera_id"), ev.get("worker_name"))
                    seen.setdefault(key, ev)
            return jsonify({"screwing_detections": list(seen.values())})

        @app.route("/api/cycles")
        def api_cycles():
            with srv._cam_lock:
                workers = list(srv._cameras.values())
            return jsonify({"cameras": [
                {"camera_id": w.camera_id, "cycle_counts": w._cycle_counts}
                for w in workers
            ]})

        @app.route("/api/workflow/<camera_id>")
        def api_workflow_status(camera_id):
            try:
                return jsonify(srv.get_camera(camera_id).cycle_status())
            except KeyError:
                return jsonify({"error": "not found"}), 404

        @app.route("/api/workflow/<camera_id>/setup", methods=["POST"])
        def api_workflow_setup(camera_id):
            try:
                w = srv.get_camera(camera_id)
            except KeyError:
                return jsonify({"error": "not found"}), 404
            body  = request.get_json(silent=True) or {}
            steps = body.get("steps")
            min_s = float(body.get("min_step_duration_s", 3.0))
            if not steps or not isinstance(steps, list):
                return jsonify({"error": "'steps' must be a non-empty list"}), 400
            w.set_workflow(steps, min_s)
            save_workflow(camera_id, steps, cfg.WORKFLOW_DIR)
            return jsonify({"camera_id": camera_id, "workflow": w.cycle_status()})

        @app.route("/api/workflow/<camera_id>/learn", methods=["POST"])
        def api_workflow_learn(camera_id):
            try:
                w = srv.get_camera(camera_id)
            except KeyError:
                return jsonify({"error": "not found"}), 404
            if srv.tool_classifier is None:
                return jsonify({
                    "error": "Tool classifier not loaded. "
                             "Run training/collect_crops.py then training/train_classifier.py."
                }), 503
            body       = request.get_json(silent=True) or {}
            video_path = body.get("video_path", "").strip()
            min_s      = float(body.get("min_step_duration_s", 3.0))
            if not video_path:
                return jsonify({"error": "'video_path' required"}), 400
            if not Path(video_path).exists():
                return jsonify({"error": f"File not found: {video_path}"}), 400
            log.info("[%s] Learning workflow from: %s", camera_id, video_path)
            try:
                learner = WorkflowLearner(
                    tool_model   = srv.tool_classifier._model,
                    pose_model   = srv.pose_model,
                    sample_every = 6,
                    min_segment_s = 1.5,
                )
                steps, timings = learner.learn(video_path)
            except Exception as exc:
                return jsonify({"error": str(exc)}), 500
            if not steps:
                return jsonify({
                    "error": "No actions detected. "
                             "Ensure the tool classifier is trained and "
                             "the video clearly shows tool use."
                }), 422
            w.set_workflow(steps, min_s)
            save_workflow(camera_id, steps, cfg.WORKFLOW_DIR)
            log.info("[%s] Workflow learned: %s", camera_id, steps)
            return jsonify({
                "camera_id":       camera_id,
                "learned_steps":   steps,
                "segment_timings": timings,
                "workflow":        w.cycle_status(),
            })

        @app.route("/api/docs")
        def api_docs():
            return jsonify({
                "endpoints": [
                    {"method": "GET",    "path": "/"},
                    {"method": "GET",    "path": "/stream/<id>"},
                    {"method": "GET",    "path": "/snapshot/<id>"},
                    {"method": "GET",    "path": "/api/health"},
                    {"method": "GET",    "path": "/api/stream-sources"},
                    {"method": "GET",    "path": "/api/cameras"},
                    {"method": "POST",   "path": "/api/cameras"},
                    {"method": "GET",    "path": "/api/cameras/<id>"},
                    {"method": "DELETE", "path": "/api/cameras/<id>"},
                    {"method": "GET",    "path": "/api/events"},
                    {"method": "GET",    "path": "/api/events/<id>"},
                    {"method": "GET",    "path": "/api/screwing"},
                    {"method": "GET",    "path": "/api/cycles"},
                    {"method": "GET",    "path": "/api/workflow/<id>"},
                    {"method": "POST",   "path": "/api/workflow/<id>/setup"},
                    {"method": "POST",   "path": "/api/workflow/<id>/learn"},
                    {"method": "GET",    "path": "/api/docs"},
                ]
            })

        return app
