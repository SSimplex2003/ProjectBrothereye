# Frontend Camera Integration - Complete Implementation

## Summary

All frontend modifications completed to enable full camera integration:

1. **Camera Selection in Station Form** - Dropdown shows all available cameras
2. **Camera Info Display** - Station details show assigned camera details
3. **Live Feed Viewer** - Real-time streaming with full-screen support
4. **RTSP Proxy Support** - RTSP streams converted to MJPEG via backend

## Modified Files

### 1. `/app/stations/page.tsx`
**Changes:**
- Fixed camera dropdown to show ALL cameras (not just selected one)
- Camera options display: `${camera.name} (${camera.location || "no location"})`
- Proper null handling: empty string "" converts to null for camera_id
- Both create and update handlers send correct snake_case fields
- Station cards show camera name (not just "Camera assigned")

**Key Lines:**
- Select value prop uses empty string "" for None (not "None")
- `cameraIdVal && cameraIdVal !== ""` check before parseInt
- Line ~356: All cameras visible in dropdown

### 2. `/app/stations/[id]/page.tsx`
**Changes:**
- Added "Camera Configuration" card showing:
  - Camera name
  - Stream mode (MJPEG/HLS/RTSP/WebRTC)
  - Effective stream URL with copy button
- Added "Live Feed" card with LiveStreamViewer component
- Proper conditional rendering if no camera assigned
- Copy button functionality for stream URL

**Display Logic:**
- Shows info card only if `station.camera_id` exists
- Shows live feed only if effective URL available
- Expected operator name shown in station info

### 3. `/components/live-stream-viewer.tsx`
**Rewritten for clarity:**
- Single responsibility: display stream only (no Card wrapper inside)
- Proper RTSP proxy: `GET /api/stream/rtsp?url=${encodeURIComponent(url)}&cameraId=${id}`
- Uses `NEXT_PUBLIC_API_BASE` constant
- Loading state with spinner
- Error state with URL preview
- Full-screen and card view modes
- Supports MJPEG, HLS, WebRTC, RTSP modes

**Key Features:**
- `getEffectiveUrl()` handles RTSP → proxy conversion
- Image error handling with fallback UI
- Proper crossOrigin="anonymous" on img tag
- Responsive aspect ratio video container

### 4. `/lib/api.ts`
**Change:**
- Updated constant from `NEXT_PUBLIC_API_URL` → `NEXT_PUBLIC_API_BASE`
- Ensures consistent environment variable usage

## Data Flow

### Creating a Station with Camera

```
User fills form:
  name, station_type, has_robot, is_active, notes
  expected_operator_name
  camera_id (selected from dropdown)
  camera_mode (auto-filled from camera, can override)
  camera_stream_url (optional override)

↓

Frontend sends POST /api/stations {
  name: string
  station_type: string
  has_robot: boolean
  is_active: boolean
  notes: string | null
  cycle_template_id: number | null
  camera_id: number | null        ← integer, not string
  camera_mode: string             ← mjpeg | hls | webrtc | rtsp
  camera_stream_url: string | null
  expected_operator_name: string | null
}

↓

Backend stores in stations table
```

### Viewing Station Details

```
GET /api/stations returns: {
  id: 1
  name: "Assembly"
  camera_id: 5
  camera_mode: "rtsp"
  camera_stream_url: null (station override)
  camera_name: "Station A Camera"           ← from camera table
  camera_stream_url_default: "rtsp://..."   ← from camera table
  expected_operator_name: "John"
  ... other fields
}

↓

Frontend computes effective URL:
  station.camera_stream_url || station.camera_stream_url_default

↓

For RTSP mode, proxies through:
  GET /api/stream/rtsp?url=${encodeURIComponent(effectiveUrl)}&cameraId=5

↓

LiveStreamViewer displays stream in <img> or <video>
```

## Environment Variables

Required in `.env.local`:

```env
NEXT_PUBLIC_API_BASE=http://localhost:3001
```

This must match your backend URL. For production:

```env
NEXT_PUBLIC_API_BASE=https://api.yourserver.com
```

## Testing Steps

1. **Backend Running**
   ```bash
   cd backend
   npm install
   npm start
   # Should be accessible at http://localhost:3001
   ```

2. **Frontend Setup**
   ```bash
   # Add to .env.local
   NEXT_PUBLIC_API_BASE=http://localhost:3001
   
   npm install
   npm run dev
   ```

3. **Create Camera**
   - Option A: Use Cameras page (if implemented)
   - Option B: Direct API call:
   ```bash
   curl -X POST http://localhost:3001/api/cameras \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Test Camera",
       "location": "Test Location",
       "stream_url": "rtsp://admin:Calin2003!@192.168.1.135:554/cam/realmonitor?channel=1&subtype=1",
       "mode": "rtsp"
     }'
   ```

4. **Create Station and Assign Camera**
   - Go to Stations page
   - Click "Add Station"
   - Fill form, select camera in "Camera Assignment"
   - Submit
   
5. **View Live Feed**
   - Go to Stations page
   - Click "View Details" on station
   - Scroll to "Live Feed" section
   - Should show video stream

## Important Notes

1. **Null Handling**: Empty string "" is converted to null before sending:
   - `camera_id: cameraIdVal && cameraIdVal !== "" ? parseInt(cameraIdVal) : null`
   - `cycle_template_id: val && val !== "" ? parseInt(val) : null`

2. **RTSP Proxy**: Only active if backend has FFmpeg installed and stream endpoint running

3. **Camera Name Display**: Uses `station.camera_name` from joined query, not stored separately

4. **Effective URL**: Always computed as `station.camera_stream_url || station.camera_stream_url_default`

5. **UI Clarity**: Station Details clearly shows:
   - What camera is assigned
   - The effective stream URL
   - The live feed in prominent position

## No Breaking Changes

- All existing routes and pages remain unchanged
- All existing APIs continue to work
- Only added new camera-related form fields and UI sections
- Backward compatible: stations without cameras work fine
