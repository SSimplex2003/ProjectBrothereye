# Factory Manager Camera Integration

This guide explains the camera live streaming features added to the Factory Manager Dashboard.

## Overview

The system now supports CCTV camera integration for live monitoring of factory workstations. Cameras can be managed independently and assigned to stations for real-time monitoring.

## Key Features

### 1. Camera Management (`/app/cameras/page.tsx`)
- **List all cameras** with their configuration
- **Create new cameras** with the following fields:
  - Camera name (unique identifier)
  - Location (optional description)
  - Stream URL (HTTP endpoint for the video feed)
  - Stream mode (MJPEG, HLS, or WebRTC)
  - Notes (optional metadata)
- **Edit existing cameras** to update configuration
- **Delete cameras** (with confirmation)

### 2. Camera Modes Supported

#### MJPEG (Motion JPEG)
- Uses HTTP-based multipart image streaming
- Best for: Simple HTTP camera feeds, development/testing
- Implementation: `<img src={streamUrl}>` refreshes automatically
- Example URL: `http://camera.local:8080/stream.mjpeg`

#### HLS (HTTP Live Streaming)
- Uses `.m3u8` playlist format
- Best for: Stable streaming over networks, buffering support
- Implementation: HTML5 `<video>` tag with HLS source
- Example URL: `http://camera.local:8080/stream.m3u8`

#### WebRTC
- Real-time communication protocol
- Best for: Low-latency, peer-to-peer streaming
- Implementation: Placeholder UI ready for WebRTC.js integration
- Note: Full implementation requires additional WebRTC server setup

### 3. Station Camera Assignment

When creating or editing a station (`/app/stations/page.tsx`), you can:
- **Assign a camera** from the camera list
- **Choose camera mode** (MJPEG, HLS, WebRTC)
- **Override stream URL** (optional) - use if camera has direct URL different from default
- **Set expected operator name** - for planning/assignment purposes

### 4. Live Feed Viewer

#### Station Details Page (`/app/stations/[id]/page.tsx`)
- Shows assigned camera's live feed
- Full-screen button for dedicated viewing
- Automatic mode-based player selection
- Error handling with user-friendly messages

#### Component: `LiveStreamViewer` (`/components/live-stream-viewer.tsx`)
- Renders appropriate player based on camera mode
- MJPEG: Direct image streaming
- HLS: HTML5 video player
- WebRTC: Placeholder interface
- Full-screen capability with Maximize/Minimize buttons

## Database Schema

### Cameras Table
```sql
CREATE TABLE cameras (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  location TEXT NULL,
  stream_url TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'mjpeg',
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Station Extensions
New fields added to the `stations` table:
```
camera_id INT NULL REFERENCES cameras(id)
camera_mode TEXT NOT NULL DEFAULT 'mjpeg'
camera_stream_url TEXT NULL
expected_operator_name TEXT NULL
```

## API Endpoints

The frontend expects these endpoints on your backend (e.g., `NEXT_PUBLIC_API_URL`):

### Camera Endpoints
```
GET    /api/cameras              # List all cameras
GET    /api/cameras/:id          # Get single camera
POST   /api/cameras              # Create camera
PUT    /api/cameras/:id          # Update camera
DELETE /api/cameras/:id          # Delete camera
```

### Station Extensions
```
PUT    /api/stations/:id         # Include camera_id, camera_mode, etc.
```

## Navigation

Added new sidebar navigation item:
- **Cameras** (Video icon) - Links to `/cameras` page

Existing navigation items enhanced:
- **Stations** - Now displays camera assignment status on cards

## Environment Variables

Ensure your project has:
```
NEXT_PUBLIC_API_URL=http://localhost:3001  # or your backend URL
```

## Implementation Notes

### MJPEG Stream Setup
If using cameras with RTSP output, convert to MJPEG using ffmpeg:
```bash
ffmpeg -rtsp_transport tcp -i rtsp://camera-ip:554/stream \
  -f mjpeg -q:v 5 http://localhost:8080/stream.mjpeg
```

Or use MediaMTX for multi-stream gateway:
```bash
# Pull RTSP, expose as MJPEG/HLS/WebRTC
./mediamtx
```

### Stream URL Examples
- **MJPEG**: `http://192.168.1.100:8080/stream.mjpeg`
- **HLS**: `http://192.168.1.100:8080/stream.m3u8`
- **WebRTC**: `ws://192.168.1.100:8080/webrtc`

### CORS Considerations
- MJPEG images use `crossOrigin="anonymous"` to handle CORS
- HLS `<video>` element handles CORS automatically
- WebRTC doesn't require CORS

## Future Enhancements

1. **WebRTC Full Implementation**
   - Add `webrtc.js` or `peerjs` library
   - Implement signaling server
   - Add peer connection UI

2. **Multi-Camera Dashboards**
   - Grid view of multiple station cameras
   - Customizable layout

3. **Stream Health Monitoring**
   - Connection status indicators
   - Bandwidth/quality metrics
   - Reconnection logic

4. **Recording & Playback**
   - Store stream segments
   - Playback UI for historical footage

5. **Camera Calibration & Analytics**
   - AI-powered operator tracking
   - Activity zone detection
   - Anomaly alerts

## Troubleshooting

### Camera Stream Not Loading
1. Verify stream URL is accessible from browser
2. Check CORS headers if using different domains
3. Ensure camera is powered and streaming
4. Test URL directly in browser address bar

### MJPEG Flashing
- Normal behavior as images refresh
- Can be smoothed with CSS transitions if needed

### HLS Buffering
- Check bitrate of camera stream
- Verify network connectivity
- Adjust player buffer settings

## Files Modified/Created

- `/scripts/001_create_factory_tables.sql` - Added cameras table & station camera fields
- `/lib/api.ts` - Added Camera types & camera API fetchers
- `/app/cameras/page.tsx` - New cameras management page
- `/components/live-stream-viewer.tsx` - New live feed viewer component
- `/app/stations/page.tsx` - Enhanced with camera assignment
- `/app/stations/[id]/page.tsx` - Added live camera feed section
- `/components/sidebar.tsx` - Added Cameras navigation link
