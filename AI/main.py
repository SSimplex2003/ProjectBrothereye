import time
from datetime import datetime, timezone
import cv2
import requests
from ultralytics import YOLO
N8N_URL = "http://localhost:5678/webhook/work-monitor"
SEND_EVERY_SEC = 2.0

ZONE_X, ZONE_Y, ZONE_W, ZONE_H = 100, 100, 400, 400

model = YOLO("../yolov8n-pose.pt")

cap = cv2.VideoCapture(0)
session = requests.Session()

last_send_ts = 0.0

track_to_operator = {}
next_operator_num = 1

last_centers = {}

def clamp(v, lo, hi):
    return max(lo, min(hi, v))

def blur_region(img, x1, y1, x2, y2, k=45):
    h, w = img.shape[:2]
    x1 = clamp(int(x1), 0, w - 1)
    y1 = clamp(int(y1), 0, h - 1)
    x2 = clamp(int(x2), 0, w - 1)
    y2 = clamp(int(y2), 0, h - 1)
    if x2 <= x1 or y2 <= y1:
        return
    roi = img[y1:y2, x1:x2]
    if roi.size == 0:
        return
    k = k if k % 2 == 1 else k + 1
    img[y1:y2, x1:x2] = cv2.GaussianBlur(roi, (k, k), 0)

def movement_speed(track_id, cx, cy, t):
    prev = last_centers.get(track_id)
    last_centers[track_id] = (cx, cy, t)
    if prev is None:
        return 0.0
    px, py, pt = prev
    dt = max(1e-6, t - pt)
    dist = ((cx - px) ** 2 + (cy - py) ** 2) ** 0.5
    return dist / dt

def estimate_head_direction(kpts_xy):
    nose = kpts_xy[0]
    ls = kpts_xy[5]
    rs = kpts_xy[6]
    if nose is None or ls is None or rs is None:
        return "Unknown"
    shoulder_mid_x = (ls[0] + rs[0]) / 2.0
    dx = nose[0] - shoulder_mid_x
    if dx > 20:
        return "Right"
    if dx < -20:
        return "Left"
    return "Forward"

def hands_state(kpts_xy):
    ls, rs = kpts_xy[5], kpts_xy[6]
    lw, rw = kpts_xy[9], kpts_xy[10]
    lh, rh = kpts_xy[11], kpts_xy[12]
    if ls is None or rs is None or lh is None or rh is None:
        return "Unknown"
    shoulder_y = (ls[1] + rs[1]) / 2.0
    hip_y = (lh[1] + rh[1]) / 2.0
    wrists = [p for p in (lw, rw) if p is not None]
    if not wrists:
        return "NoWrist"
    wy = sum(p[1] for p in wrists) / len(wrists)
    if wy < shoulder_y - 10:
        return "HandsUp"
    if shoulder_y - 10 <= wy <= hip_y + 10:
        return "HandsMid"
    return "HandsLow"

def classify_activity(head_dir, hands, speed_px_s, in_zone):
    if speed_px_s > 80:
        return "Moving"
    if not in_zone:
        return "Break"
    if head_dir == "Right":
        return "Researching"
    if head_dir == "Left":
        return "Other"
    if hands in ("HandsMid", "HandsLow"):
        return "Coding"
    return "Working"

SKELETON_EDGES = [
    (5, 6), (5, 7), (7, 9), (6, 8), (8, 10),
    (5, 11), (6, 12), (11, 12), (11, 13), (13, 15),
    (12, 14), (14, 16), (0, 5), (0, 6)
]

def draw_skeleton(img, kpts_xy):
    for a, b in SKELETON_EDGES:
        pa = kpts_xy[a]
        pb = kpts_xy[b]
        if pa is None or pb is None:
            continue
        cv2.line(img, (int(pa[0]), int(pa[1])), (int(pb[0]), int(pb[1])), (255, 0, 0), 2)
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
                if conf >= 0.35:
                    pts.append((float(kpts_xy_all[i][j][0]), float(kpts_xy_all[i][j][1])))
                else:
                    pts.append(None)
            kpts_xy = pts

        people.append({"id": track_id, "bbox": (x1, y1, x2, y2), "kpts": kpts_xy})
    return people

print("Agent starting (multi-person pose+tracking). Press Q to quit.")

while True:
    ret, frame = cap.read()
    if not ret:
        break

    h, w = frame.shape[:2]
    now = time.time()

    results = model.track(frame, persist=True, verbose=False, conf=0.35, iou=0.5)
    r0 = results[0]
    people = extract_people(r0)

    cv2.rectangle(frame, (ZONE_X, ZONE_Y), (ZONE_X + ZONE_W, ZONE_Y + ZONE_H), (255, 0, 0), 2)

    payloads_to_send = []

    for p in people:
        tid = p["id"]
        x1, y1, x2, y2 = p["bbox"]

        if tid not in track_to_operator:
            track_to_operator[tid] = f"Operator_{next_operator_num}"
            next_operator_num += 1

        op_name = track_to_operator[tid]

        blur_region(frame, x1, y1, x2, y2, k=55)

        cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
        in_zone = (ZONE_X < cx < ZONE_X + ZONE_W) and (ZONE_Y < cy < ZONE_Y + ZONE_H)
        spd = movement_speed(tid, cx, cy, now)

        head_dir = "Unknown"
        hands = "Unknown"
        if p["kpts"] is not None:
            head_dir = estimate_head_direction(p["kpts"])
            hands = hands_state(p["kpts"])

        activity = classify_activity(head_dir, hands, spd, in_zone)

        cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (255, 0, 0), 3)

        if p["kpts"] is not None:
            draw_skeleton(frame, p["kpts"])

        cv2.putText(frame, f"{op_name} - {activity}", (int(x1), max(20, int(y1) - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        payloads_to_send.append({
            "worker_name": op_name,
            "activity_type": activity,
            "head_direction": head_dir,
            "hands_state": hands,
            "speed_px_s": round(spd, 2),
            "in_zone": bool(in_zone),
            "event_time": datetime.now(timezone.utc).isoformat()
        })

    if now - last_send_ts >= SEND_EVERY_SEC and payloads_to_send:
        for payload in payloads_to_send:
            try:
                resp = session.post(N8N_URL, json=payload, timeout=3)
                print("POST", resp.status_code, payload)
            except Exception as e:
                print("Error sending to n8n:", e)
        last_send_ts = now

    cv2.imshow("Agent", frame)
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()
