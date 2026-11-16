import os
import torch
from pathlib import Path

def _select_device() -> str:
    if torch.cuda.is_available():
        name = torch.cuda.get_device_name(0)
        vram = round(torch.cuda.get_device_properties(0).total_memory / 1024 ** 3, 1)
        print(f"[Brothereye] GPU detected: {name} ({vram} GB) — using CUDA")
        return "cuda"
    print("[Brothereye] No GPU detected — using CPU")
    return "cpu"

DEVICE = os.getenv("DEVICE") or _select_device()

_AI   = Path(__file__).resolve().parents[1]
ROOT  = _AI.parent

POSE_MODEL   = str(ROOT / "yolov8n-pose.pt")
SEG_MODEL    = str(ROOT / "yolov8n-seg.pt")
ACTION_MODEL = str(_AI  / "runs" / "action_classifier" / "weights" / "best.pt")
TOOL_MODEL   = str(_AI  / "runs" / "tool_classifier" / "weights" / "best.pt")
WORKFLOW_DIR = _AI / "runs" / "workflows"

POSE_CONF       = float(os.getenv("POSE_CONF", "0.35"))
POSE_IOU        = float(os.getenv("POSE_IOU",  "0.50"))
SEG_CONF        = float(os.getenv("SEG_CONF",  "0.25"))
SEG_MASK_THRESH = 0.50
SEG_INFER_EVERY = int(os.getenv("SEG_INFER_EVERY", "3"))
BLUR_K          = 55
MASK_FEATHER    = 9

ACTION_ENABLED     = os.getenv("ENABLE_ACTION_MODEL", "1") == "1"
ACTION_INFER_EVERY = 8

TOOL_CONF_MIN    = float(os.getenv("TOOL_CONF_MIN", "0.60"))
TOOL_INFER_EVERY = 4

PG_DSN      = os.getenv("PG_DSN", "postgresql://postgres:mysecretpassword@localhost:5432/factory_manager")
PG_ENABLED  = bool(PG_DSN)
N8N_URL     = os.getenv("N8N_URL", "http://localhost:5678/webhook/work-monitor")
N8N_ENABLED = os.getenv("N8N_ENABLED", "0") == "1"

JPEG_QUALITY = int(os.getenv("JPEG_QUALITY", "75"))
FPS_CAP      = float(os.getenv("STREAM_FPS", "30"))
FRAME_SLEEP  = 1.0 / FPS_CAP

HOST         = os.getenv("HOST", "0.0.0.0")
PORT         = int(os.getenv("PORT", "5000"))
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")

MAX_EVENTS       = 200
RTSP_FORCE_TCP   = True
RTSP_BUFFER_SIZE = 1
DROP_OLD_FRAMES  = True

ACTION_COLOURS = {
    "screwing":  (0,  200, 100),
    "working":   (0,  200, 255),
    "idle":      (160, 160,  0),
    "moving":    (0,  120, 255),
    "break":     (120, 60,  60),
}
DEFAULT_COLOUR = (200, 200, 200)
