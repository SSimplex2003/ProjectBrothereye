# RTSP API Reference

## Environment Setup

Before making requests, ensure:
- Backend is running: `npm run dev` (in the `/backend` folder)
- Default backend URL: `http://localhost:3001`
- Camera URL: `rtsp://admin:Calin2003@192.168.0.101/cam/realmonitor?channel=1&subtype=1`

## API Endpoints

### 1. Test RTSP Connection (Before Adding Camera)

**Endpoint:** `POST /api/cameras/test-rtsp`

**Purpose:** Verify the RTSP URL works before creating the camera in the database

**Request (PowerShell):**
```powershell
$rtspUrl = "rtsp://admin:Calin2003@192.168.0.101/cam/realmonitor?channel=1&subtype=1"

$body = @{
    url = $rtspUrl
    timeout = 10
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3001/api/cameras/test-rtsp" `
  -Method POST `
  -Headers @{"Content-Type" = "application/json"} `
  -Body $body -TimeoutSec 15
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "✅ RTSP connection successful",
  "url": "rtsp://admin:****@192.168.0.101/cam/realmonitor?channel=1&subtype=1"
}
```

**Failure Response (400):**
```json
{
  "success": false,
  "error": "Failed to connect to RTSP stream",
  "troubleshooting": [
    "• Verify the RTSP URL format is correct",
    "• Check username and password are correct",
    "• Ensure the camera IP address is accessible",
    "...more suggestions..."
  ]
}
```

**Notes:**
- This endpoint takes 10-15 seconds to run (FFmpeg connection attempt)
- Use appropriate timeout in your HTTP client
- Test this BEFORE adding the camera to save time

---

### 2. Create Camera (Add to System)

**Endpoint:** `POST /api/cameras`

**Purpose:** Add the camera to the database so it shows in the web UI

**Request (PowerShell):**
```powershell
$camera = @{
    name = "Factory Floor Camera 1"
    location = "Assembly Station A"
    stream_url = "rtsp://admin:Calin2003@192.168.0.101/cam/realmonitor?channel=1&subtype=1"
    mode = "rtsp"
    notes = "Dahua IP Camera - Main Feed"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3001/api/cameras" `
  -Method POST `
  -Headers @{"Content-Type" = "application/json"} `
  -Body $camera
```

**Success Response (201):**
```json
{
  "id": 1,
  "name": "Factory Floor Camera 1",
  "location": "Assembly Station A",
  "stream_url": "rtsp://admin:Calin2003@192.168.0.101/cam/realmonitor?channel=1&subtype=1",
  "mode": "rtsp",
  "notes": "Dahua IP Camera - Main Feed",
  "created_at": "2026-02-20T14:32:00.000Z"
}
```

**Error Response (400) - Duplicate Name:**
```json
{
  "error": "Camera name already exists"
}
```

**Field Reference:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | ✅ | Unique camera name |
| location | string | ❌ | Physical location |
| stream_url | string | ✅ | RTSP URL |
| mode | string | ✅ | One of: `rtsp`, `mjpeg`, `hls`, `webrtc` |
| notes | string | ❌ | Additional information |

---

### 3. Get All Cameras

**Endpoint:** `GET /api/cameras`

**Request (PowerShell):**
```powershell
Invoke-WebRequest -Uri "http://localhost:3001/api/cameras" -Method GET | ConvertFrom-Json
```

**Response (200):**
```json
[
  {
    "id": 1,
    "name": "Factory Floor Camera 1",
    "location": "Assembly Station A",
    "stream_url": "rtsp://admin:Calin2003@192.168.0.101/cam/realmonitor?channel=1&subtype=1",
    "mode": "rtsp",
    "notes": "Dahua IP Camera - Main Feed",
    "created_at": "2026-02-20T14:32:00.000Z"
  }
]
```

---

### 4. Get Single Camera

**Endpoint:** `GET /api/cameras/{id}`

**Request (PowerShell):**
```powershell
Invoke-WebRequest -Uri "http://localhost:3001/api/cameras/1" -Method GET | ConvertFrom-Json
```

**Response (200):**
```json
{
  "id": 1,
  "name": "Factory Floor Camera 1",
  "location": "Assembly Station A",
  "stream_url": "rtsp://admin:Calin2003@192.168.0.101/cam/realmonitor?channel=1&subtype=1",
  "mode": "rtsp",
  "notes": "Dahua IP Camera - Main Feed",
  "created_at": "2026-02-20T14:32:00.000Z"
}
```

---

### 5. Update Camera

**Endpoint:** `PUT /api/cameras/{id}`

**Request (PowerShell):**
```powershell
$update = @{
    location = "Assembly Station B"
    notes = "Moved to new location"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3001/api/cameras/1" `
  -Method PUT `
  -Headers @{"Content-Type" = "application/json"} `
  -Body $update
```

**Response (200):** Updated camera object

---

### 6. Delete Camera

**Endpoint:** `DELETE /api/cameras/{id}`

**Request (PowerShell):**
```powershell
Invoke-WebRequest -Uri "http://localhost:3001/api/cameras/1" -Method DELETE
```

**Response (200):**
```json
{
  "success": true,
  "deleted": {
    "id": 1,
    "name": "Factory Floor Camera 1",
    ...
  }
}
```

---

### 7. Stream Video (Used by Frontend)

**Endpoint:** `GET /api/stream/rtsp`

**Purpose:** Converts RTSP to MJPEG stream for browser playback

**URL Format:**
```
http://localhost:3001/api/stream/rtsp?url={ENCODED_URL}&cameraId={ID}&quality={QUALITY}&transport={TRANSPORT}
```

**Parameters:**
| Parameter | Type | Default | Values |
|-----------|------|---------|--------|
| url | string | required | URL-encoded RTSP URL |
| cameraId | string | auto | Camera ID for tracking |
| quality | string | medium | low, medium, high |
| transport | string | tcp | tcp, udp |

**Example:**
```
http://localhost:3001/api/stream/rtsp?url=rtsp%3A%2F%2Fadmin%3ACalin2003%40192.168.0.101%2Fcam%2Frealmonitor%3Fchannel%3D1%26subtype%3D1&cameraId=1&quality=high&transport=tcp
```

**How Frontend Uses It:**
```tsx
// Frontend automatically constructs this URL for RTSP cameras
const streamUrl = `http://localhost:3001/api/stream/rtsp?url=${encodeURIComponent(
  "rtsp://admin:Calin2003@192.168.0.101/cam/realmonitor?channel=1&subtype=1"
)}&cameraId=1&quality=medium`

// Then displays as MJPEG in <img> tag
<img src={streamUrl} />
```

**Response:**
- Content-Type: `multipart/x-mixed-replace; boundary=ffmpeg`
- Returns continuous MJPEG stream (binary data)
- Browser automatically renders as video

---

## Workflow: Adding Your IP Camera

### Step 1: Test Connection
```powershell
.\test-rtsp.ps1
```
This runs all diagnostics and shows if camera is reachable.

### Step 2: Create Camera via API
```powershell
$camera = @{
    name = "Main Factory Camera"
    location = "Assembly Floor"
    stream_url = "rtsp://admin:Calin2003@192.168.0.101/cam/realmonitor?channel=1&subtype=1"
    mode = "rtsp"
    notes = "Main production camera"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3001/api/cameras" `
  -Method POST `
  -Headers @{"Content-Type" = "application/json"} `
  -Body $camera
```

### Step 3: View in Web UI
1. Open application in browser
2. Go to **Cameras** page
3. You should see "Main Factory Camera" listed
4. Click to view the live feed

---

## Query Parameters for Different Camera Models

Some IP cameras require specific paths or parameters:

### Dahua Cameras (like yours)
```
rtsp://admin:password@IP/cam/realmonitor?channel=1&subtype=1
rtsp://admin:password@IP/cam/realmonitor?channel=1&subtype=0
```

### Hikvision Cameras
```
rtsp://admin:password@IP:554/ISAPI/streaming/channels/101
rtsp://admin:password@IP:554/ISAPI/streaming/channels/102
```

### Generic RTSP
```
rtsp://admin:password@IP:554/stream1
rtsp://admin:password@IP/live/main
```

---

## Troubleshooting with cURL

### Test Basic Connection (Windows Command Prompt)
```bash
curl -i http://localhost:3001/api/cameras
```

### Test RTSP Endpoint with Query Parameter
```bash
curl -i "http://localhost:3001/api/stream/rtsp?url=rtsp%3A%2F%2Fadmin%3ACalin2003%40192.168.0.101%2Fcam%2Frealmonitor%3Fchannel%3D1%26subtype%3D1&quality=medium"
```

### Check Server is Running
```bash
curl -i http://localhost:3001/api/health
```

Expected response:
```json
{"status":"ok","timestamp":"2026-02-20T14:32:00.000Z"}
```

---

## Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `Connection timeout` | Camera unreachable | Check IP, firewall, camera is on |
| `Authentication failed` | Wrong credentials | Verify username/password |
| `RTSP_STATUS_SERVICE_UNAVAILABLE` | Camera doesn't support RTSP | Enable RTSP in camera settings |
| `Failed to connect` | Transport protocol wrong | Try `transport=udp` parameter |
| `No module ffmpeg-static` | FFmpeg not installed | Run `npm install` in /backend |

---

## Environment Variables

Optional backend configuration in `.env`:

```env
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=mysecretpassword
DB_NAME=postgres
FRONTEND_ORIGIN=http://localhost:3000
```

Default values work for local development.
