import os
from pathlib import Path

_AI   = Path(__file__).resolve().parents[1]
ROOT  = _AI.parent

POSE_MODEL  = str(ROOT / "yolov8n-pose.pt")
SEG_MODEL   = str(ROOT / "yolov8n-seg.pt")
X3D_MODEL   = str(_AI  / "runs" / "x3d" / "best.pt")
TOOL_MODEL  = str(_AI  / "runs" / "tool_classifier" / "weights" / "best.pt")
WORKFLOW_DIR = _AI / "runs" / "workflows"

POSE_CONF       = float(os.getenv("POSE_CONF", "0.35"))
POSE_IOU        = float(os.getenv("POSE_IOU",  "0.50"))
SEG_CONF        = float(os.getenv("SEG_CONF",  "0.25"))
SEG_MASK_THRESH = 0.50
BLUR_K          = 55
MASK_FEATHER    = 9

X3D_ENABLED     = os.getenv("ENABLE_X3D", "1") == "1"
X3D_CLIP_LEN    = 16
X3D_INFER_EVERY = 8

TOOL_CONF_MIN    = float(os.getenv("TOOL_CONF_MIN", "0.60"))
TOOL_INFER_EVERY = 4

PG_DSN      = os.getenv("PG_DSN", "postgresql://postgres:mysecretpassword@localhost:5432/postgres")
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
