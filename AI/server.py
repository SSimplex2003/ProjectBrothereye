import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from brothereye.streaming import StreamingServer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s")

log = logging.getLogger("brothereye")

if __name__ == "__main__":
    server = StreamingServer()

    for entry in os.getenv("INIT_CAMERAS", "").split(","):
        entry = entry.strip()
        if ":" not in entry:
            continue
        cam_id, _, cam_src = entry.partition(":")
        cam_id  = cam_id.strip()
        cam_src = cam_src.strip()
        src     = int(cam_src) if cam_src.isdigit() else cam_src
        try:
            server.add_camera(cam_id, src)
            log.info("Auto-started camera: %s → %s", cam_id, cam_src)
        except Exception as exc:
            log.warning("Auto-start failed for %s: %s", cam_id, exc)

    server.run()
