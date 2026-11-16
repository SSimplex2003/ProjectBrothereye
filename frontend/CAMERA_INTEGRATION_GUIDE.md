# Camera Integration Setup Guide

## Environment Variables

Set these in your `.env.local` file:

```env
NEXT_PUBLIC_API_BASE=http://localhost:3001
```

For production, change to your production backend URL:
```env
NEXT_PUBLIC_API_BASE=https://your-backend.example.com
```

## Backend Requirements

Ensure your Express backend at `/backend/server.js` has:

1. **Camera endpoints** (already implemented):
   - `GET /api/cameras` - List all cameras
   - `POST /api/cameras` - Create camera
   - `PUT /api/cameras/:id` - Update camera
   - `DELETE /api/cameras/:id` - Delete camera

2. **Stations endpoints** (must support these fields):
   - `camera_id` - ID of assigned camera
   - `camera_mode` - Stream mode (mjpeg, hls, webrtc, rtsp)
   - `camera_stream_url` - Optional URL override per station
   - `expected_operator_name` - Operator assigned to station

3. **RTSP Proxy** (if using RTSP):
   - `GET /api/stream/rtsp?url=...&cameraId=...` - Converts RTSP to MJPEG

## Frontend Workflow

### 1. Create/Assign Cameras

1. Go to **Cameras** page (if available)
2. Create camera with:
   - Name: e.g., "Assembly Station A"
   - Location: e.g., "Building 2, Floor 1"
   - Stream URL: 
     - MJPEG: `http://192.168.1.10:8080/stream`
     - HLS: `http://192.168.1.10:8080/stream.m3u8`
     - RTSP: `rtsp://admin:password@192.168.1.135:554/cam/realmonitor?channel=1&subtype=1`
   - Mode: Select matching type
   - Notes: Optional

### 2. Assign Camera to Station

1. Go to **Stations** page
2. Create new station or edit existing
3. In **Camera Assignment** section:
   - Select camera from dropdown (shows name + location)
   - Camera Mode will default to camera's mode (can override)
   - Stream URL Override (optional - leave empty to use camera's default URL)
   - Expected Operator Name (optional)
4. Save station

### 3. View Live Feed

1. Go to **Stations** page
2. Click **View Details** on a station with camera assigned
3. Live feed displays in **Live Feed** section
4. Click maximize icon for full-screen view

## Stream URL Examples

### MJPEG (HTTP Motion JPEG)
```
http://192.168.1.10:8080/stream
http://192.168.1.10:8080/mjpeg
```

### HLS (HTTP Live Streaming)
```
http://192.168.1.10:8080/stream.m3u8
http://192.168.1.10:8080/live.m3u8
```

### RTSP (Real Time Streaming Protocol)
```
rtsp://admin:password@192.168.1.135:554/stream
rtsp://admin:password@192.168.1.135:554/cam/realmonitor?channel=1&subtype=1
rtsp://192.168.1.10/stream1
```

### WebRTC
```
http://192.168.1.10:8080/webrtc
```

## Troubleshooting

### "Failed to load stream" Error

**Check:**
1. Camera URL is correct and accessible from your backend server
2. Backend server can reach the camera (ping camera IP)
3. Camera credentials are correct (if RTSP with auth)
4. Camera port is open and accessible
5. Browser console for CORS errors

**For RTSP:**
- Verify FFmpeg is installed on backend server: `ffmpeg -version`
- Check backend logs for FFmpeg errors
- Try accessing camera directly with VLC to verify stream works

### Stream Shows But No Video

1. Check camera is recording/streaming
2. Verify credentials if using RTSP with authentication
3. Try different stream path (some cameras have multiple paths)
4. Check camera logs for connection issues

### Camera Dropdown Empty

1. Make sure you created cameras first in Cameras page
2. Backend GET /api/cameras endpoint is working
3. Check browser network tab for API errors

## API Request Examples

### Create Camera
```bash
curl -X POST http://localhost:3001/api/cameras \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Station A",
    "location": "Building 2",
    "stream_url": "rtsp://admin:pass@192.168.1.135:554/stream",
    "mode": "rtsp",
    "notes": "Main assembly area"
  }'
```

### Assign Camera to Station
```bash
curl -X PUT http://localhost:3001/api/stations/1 \
  -H "Content-Type: application/json" \
  -d '{
    "camera_id": 1,
    "camera_mode": "rtsp",
    "camera_stream_url": null,
    "expected_operator_name": "John"
  }'
```

### Get Station with Camera Info
```bash
curl http://localhost:3001/api/stations/1
```

Response includes:
- `camera_name` - Name of assigned camera
- `camera_stream_url_default` - Camera's default stream URL
- `camera_stream_url` - Station-specific override (if any)
- `camera_mode` - Stream protocol mode
- `expected_operator_name` - Assigned operator
