# Camera Integration - Quick Reference

## What Changed

### Frontend Files Modified
- `/app/stations/page.tsx` - Fixed camera form to show all cameras, proper null handling
- `/app/stations/[id]/page.tsx` - Added camera info card + live feed display
- `/components/live-stream-viewer.tsx` - Simplified RTSP proxy logic
- `/lib/api.ts` - Uses `NEXT_PUBLIC_API_BASE` environment variable

### Key Features
✓ Select any camera when creating/editing stations  
✓ Camera dropdown shows name + location  
✓ Station form sends proper null values for empty fields  
✓ Station details show camera configuration + effective stream URL  
✓ Live feed displays with copy URL button  
✓ RTSP streams automatically proxied to MJPEG via backend  
✓ Full-screen camera viewing  

## Test Checklist

- [ ] Set `NEXT_PUBLIC_API_BASE` in `.env.local`
- [ ] Backend running at configured URL
- [ ] Create a camera: Cameras page → Add → Fill details
- [ ] Create/edit station: Stations → Select camera from dropdown
- [ ] View live feed: Stations → View Details → See live feed
- [ ] Test RTSP: Add RTSP URL, watch proxy convert to MJPEG
- [ ] Test full-screen: Click maximize icon in live feed

## Environment Setup

```bash
# .env.local
NEXT_PUBLIC_API_BASE=http://localhost:3001
```

Production:
```bash
NEXT_PUBLIC_API_BASE=https://api.yourserver.com
```

## Common URLs

**MJPEG:**
```
http://192.168.1.100:8080/stream
```

**RTSP:**
```
rtsp://admin:Calin2003!@192.168.1.135:554/cam/realmonitor?channel=1&subtype=1
```

**HLS:**
```
http://192.168.1.100:8080/live.m3u8
```

## File Structure

```
app/stations/
├── page.tsx          (List + Create/Edit Form)
└── [id]/page.tsx    (Details + Live Feed)
components/
└── live-stream-viewer.tsx  (Stream Display)
lib/
└── api.ts           (API calls + types)
```

## Data Flow

```
Station Form
    ↓
POST /api/stations { camera_id, camera_mode, camera_stream_url, ... }
    ↓
Backend stores in stations table
    ↓
GET /api/stations returns: camera_id, camera_mode, camera_stream_url, camera_name, camera_stream_url_default
    ↓
Station Details page
    ↓
Live Feed Component
    ↓
If RTSP: Proxy through GET /api/stream/rtsp?url=...
    ↓
Display in <img> or <video> tag
```

## Notes

- Camera dropdown uses `camera_id` as value (integer)
- Effective URL = station override OR camera default
- RTSP requires FFmpeg + stream/rtsp endpoint on backend
- All requests use snake_case keys (camera_id, not cameraId)
- Empty string "" converted to null for optional integer fields
