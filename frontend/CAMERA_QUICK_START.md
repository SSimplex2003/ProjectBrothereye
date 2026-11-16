# Quick Start: Camera Integration

## Setup Steps

### 1. Run Database Migration
Execute the updated migration script to add camera tables:
```bash
# Using PostgreSQL directly
psql -U your_user -d your_db -f scripts/001_create_factory_tables.sql
```

### 2. Backend API Requirements
Ensure your backend (running at `NEXT_PUBLIC_API_URL`) implements these endpoints:

**Cameras API:**
```javascript
// GET /api/cameras
// Returns: [{ id, name, location, stream_url, mode, notes, created_at }, ...]

// POST /api/cameras
// Body: { name, location?, stream_url, mode, notes? }

// PUT /api/cameras/:id
// Body: { name?, location?, stream_url?, mode?, notes? }

// DELETE /api/cameras/:id
```

**Station Updates:**
The existing station endpoints should handle new fields:
```javascript
// PUT /api/stations/:id
// Can now include:
// - camera_id (number | null)
// - camera_mode ("mjpeg" | "hls" | "webrtc")
// - camera_stream_url (string | null)
// - expected_operator_name (string | null)
```

### 3. Set Environment Variable
Make sure `NEXT_PUBLIC_API_URL` is set correctly:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 4. Prepare Camera Streams

For **MJPEG streams** (easiest to get started):
```bash
# If you have camera with RTSP output:
ffmpeg -rtsp_transport tcp -i rtsp://camera-ip:554/stream \
  -f mjpeg -q:v 5 http://localhost:8080/stream.mjpeg
```

For **HLS streams**:
```bash
# Use MediaMTX or similar streaming server
# Output: http://your-server:8080/stream.m3u8
```

### 5. Create First Camera
1. Navigate to Cameras page (`/cameras`)
2. Click "Add Camera"
3. Fill in details:
   - **Name**: "Assembly Station A"
   - **Location**: "Assembly Line"
   - **Mode**: MJPEG (for testing)
   - **Stream URL**: Your camera stream endpoint
   - **Notes**: Optional

### 6. Assign Camera to Station
1. Go to Stations page (`/stations`)
2. Edit or create a station
3. In the form, under "Camera Assignment":
   - Select the camera you just created
   - Camera Mode will auto-populate from camera settings
   - (Optional) Override Stream URL if different from camera default
4. Save

### 7. View Live Feed
1. Go to Stations page
2. Click "View Details" on a station with an assigned camera
3. Live feed viewer shows the camera stream
4. Click maximize icon for full-screen viewing

## Testing with Mock Streams

### Generate Test MJPEG Stream (Linux)
```bash
# Using ImageMagick to generate moving test pattern
convert -size 800x600 xc:blue - | convert - ppm:- | \
  ffmpeg -f image2pipe -vcodec ppm -i - -f mjpeg -q:v 5 http://localhost:8080/stream.mjpeg
```

### Using Test Camera Docker
```bash
docker run -d -p 8080:8080 \
  ccrisan/motioneye:latest

# Access: http://localhost:8080
# Stream URL: http://localhost:8080/stream
```

## Verification Checklist

- [ ] Database migrations executed successfully
- [ ] Backend API endpoints are responding
- [ ] `NEXT_PUBLIC_API_URL` is configured
- [ ] At least one camera is created and working
- [ ] Station has camera assigned
- [ ] Live feed displays on station details page
- [ ] Full-screen button works
- [ ] No console errors in browser DevTools

## Common Issues & Solutions

### "Failed to load cameras" error
- Check backend is running at `NEXT_PUBLIC_API_URL`
- Verify `/api/cameras` endpoint exists and returns JSON
- Check CORS headers if on different domain

### Camera stream shows blank/black
- Verify stream URL is correct
- Test URL directly in browser
- Check camera is powered on and streaming
- Verify firewall/network allows access

### MJPEG image shows up once then stops
- Check if stream URL continues to push new frames
- Test with curl: `curl http://your-stream-url -v`
- May need to adjust camera refresh rate

### "WebRTC not implemented" message
- This is expected - WebRTC support is placeholder
- Use MJPEG or HLS for now
- WebRTC implementation coming in future release

## Next Steps

After getting cameras working:
1. Set up multiple cameras across different stations
2. Configure appropriate stream modes for your network
3. Test full-screen viewing for operator displays
4. Explore sidebar navigation and integration
5. Plan multi-camera dashboard layout (future feature)

For detailed documentation, see `/CAMERA_INTEGRATION.md`
