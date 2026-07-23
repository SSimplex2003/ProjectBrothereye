# Brothereye — HTTP API Reference

Base URL: `http://localhost:5000`

---

## Dashboard

### `GET /`
Live HTML dashboard showing all active camera streams with status indicators.
Auto-refreshes every 30 seconds.

---

## Streams

### `GET /stream/<id>`
MJPEG live stream for a camera.  Load directly in a browser `<img>` tag or
any MJPEG-compatible player.

### `GET /snapshot/<id>`
Single JPEG frame from a camera (most recent processed frame).

---

## Health

### `GET /api/health`
```json
{
  "status": "ok",
  "cameras_total": 2,
  "cameras_connected": 2,
  "db_enabled": true,
  "tool_classifier": true,
  "x3d": false
}
```

---

## Cameras

### `GET /api/cameras`
List all cameras and their current status.

### `POST /api/cameras`
Add a camera.

**Body**
```json
{
  "id":             "cam1",
  "source":         "rtsp://admin:pass@192.168.0.101:554/stream",
  "label":          "Assembly Line A",
  "zone":           [100, 100, 400, 400],
  "workflow_steps": ["cutting", "screwing", "place_part"]
}
```

`source` can be:
- An integer (`0`, `1`, …) for USB / webcam
- `"rtsp://…"` for IP cameras
- `"http://…"` for MJPEG HTTP sources

`zone` is `[x, y, width, height]` — the work zone rectangle drawn on screen.

`workflow_steps` is optional.  If omitted, the last saved workflow for this
camera ID is restored automatically (if one exists).

**Response** `201`
```json
{ "camera": { "id": "cam1", "label": "Assembly Line A", "connected": true, "fps": 24.3 } }
```

### `GET /api/cameras/<id>`
Status of one camera.

### `DELETE /api/cameras/<id>`
Stop and remove a camera.

### `GET /api/stream-sources`
All cameras with pre-built stream and snapshot URLs — useful for frontend
integration.

```json
{
  "sources": [
    {
      "id":           "cam1",
      "stream_url":   "http://localhost:5000/stream/cam1",
      "snapshot_url": "http://localhost:5000/snapshot/cam1",
      "source_type":  "rtsp",
      "connected":    true,
      "fps":          24.3
    }
  ]
}
```

---

## Events

### `GET /api/events`
Last 200 activity events across all cameras.

### `GET /api/events/<id>`
Last 200 events for one camera.

Each event looks like:
```json
{
  "camera_id":     "cam1",
  "worker_name":   "cam1_Op1",
  "activity_type": "screwing",
  "confidence":    0.87,
  "event_time":    "2025-01-01T10:00:00.000Z"
}
```

### `GET /api/screwing`
Most recent screwing detection per worker across all cameras.
Useful for a live "is anyone screwing right now?" indicator.

---

## Cycle Counts

### `GET /api/cycles`
Total completed action cycles per worker per camera.

```json
{
  "cameras": [
    {
      "camera_id": "cam1",
      "cycle_counts": {
        "cam1_Op1": { "screwing": 14, "cutting": 3 }
      }
    }
  ]
}
```

A cycle is counted each time an action is sustained continuously for ≥ 3 seconds.

---

## Workflow

### `GET /api/workflow/<id>`
Current workflow state for a camera.

```json
{
  "camera_id": "cam1",
  "cycle_counts": { "cam1_Op1": { "screwing": 14 } },
  "workflow": {
    "steps":        ["cutting", "screwing", "place_part"],
    "current_step": "screwing",
    "step_index":   1,
    "total_steps":  3,
    "progress":     0.33,
    "cycle_count":  5,
    "wf_start":     "2025-01-01T10:00:00.000Z"
  },
  "recent_events": []
}
```

### `POST /api/workflow/<id>/setup`
Set or replace the workflow steps for a camera.

**Body**
```json
{
  "steps":               ["cutting", "screwing", "place_part"],
  "min_step_duration_s": 2.5
}
```

`min_step_duration_s` — how long a worker must be doing a step before it counts
as completed (default 2.5 seconds).

The steps are saved to disk and will be restored on server restart.

### `POST /api/workflow/<id>/learn`
Learn the workflow sequence automatically from a reference video.

The reference video should show **one complete production cycle** — e.g. a
worker cutting a part, then screwing it, then placing it.

The AI watches the video using the tool classifier and extracts the step sequence
automatically.

**Requires the tool classifier to be trained first** (see `training.md`).

**Body**
```json
{
  "video_path":          "C:/Videos/reference_cycle.mp4",
  "min_step_duration_s": 2.5
}
```

**Response**
```json
{
  "camera_id":     "cam1",
  "learned_steps": ["cutting", "screwing", "place_part"],
  "segment_timings": [
    { "step": "cutting",    "start_s": 0.0,  "end_s": 12.3, "duration_s": 12.3 },
    { "step": "screwing",   "start_s": 14.1, "end_s": 38.7, "duration_s": 24.6 },
    { "step": "place_part", "start_s": 40.0, "end_s": 52.1, "duration_s": 12.1 }
  ],
  "workflow": { ... }
}
```

---

## Docs

### `GET /api/docs`
Lists all available endpoints as JSON.

---

## Postgres tables

The server writes to four tables.  Run these `CREATE TABLE` statements once
before starting the server with `PG_DSN` set.

```sql
CREATE TABLE IF NOT EXISTS activity_state (
    worker_name      TEXT PRIMARY KEY,
    last_activity    TEXT,
    last_start_time  TIMESTAMPTZ,
    last_seen_time   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id               SERIAL PRIMARY KEY,
    worker_name      TEXT,
    activity_type    TEXT,
    duration_minutes NUMERIC,
    start_time       TIMESTAMPTZ,
    end_time         TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cycle_logs (
    id          SERIAL PRIMARY KEY,
    camera_id   TEXT,
    worker_name TEXT,
    action_type TEXT,
    cycle_count INTEGER,
    duration_s  NUMERIC,
    ts          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS workflow_cycles (
    id          SERIAL PRIMARY KEY,
    camera_id   TEXT,
    steps       TEXT,
    duration_s  NUMERIC,
    start_time  TIMESTAMPTZ,
    end_time    TIMESTAMPTZ,
    cycle_count INTEGER
);
```
