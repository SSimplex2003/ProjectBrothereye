# Quick Start - Camera Integration

## 30-Second Setup

1. **Set environment variable** in `.env.local`:
   ```env
   NEXT_PUBLIC_API_BASE=http://localhost:3001
   ```

2. **Start backend**:
   ```bash
   cd backend && npm install && npm start
   ```

3. **Start frontend**:
   ```bash
   npm install && npm run dev
   ```

4. **Create a camera** (POST to backend):
   ```bash
   curl -X POST http://localhost:3001/api/cameras \
     -H "Content-Type: application/json" \
     -d '{
       "name": "My Camera",
       "location": "Station A",
       "stream_url": "rtsp://admin:Calin2003!@192.168.1.135:554/cam/realmonitor?channel=1&subtype=1",
       "mode": "rtsp"
     }'
   ```

5. **Assign camera to station**:
   - Go to http://localhost:3000/stations
   - Click "Add Station" or edit existing
   - In "Camera Assignment" section, select your camera
   - Save

6. **View live feed**:
   - Click "View Details" on the station
   - Scroll to "Live Feed" section
   - See your camera stream!

## What Was Fixed

✓ Camera dropdown shows all cameras (not just selected one)  
✓ Camera name displayed on station cards  
✓ Station details show camera configuration + effective URL  
✓ Live feed displays prominently with copy button  
✓ RTSP streams automatically proxied via backend  
✓ Proper null handling for optional fields  
✓ Uses snake_case for all API requests  

## Files Changed

- `/app/stations/page.tsx` - Form & list display
- `/app/stations/[id]/page.tsx` - Details page with camera info
- `/components/live-stream-viewer.tsx` - Stream display logic
- `/lib/api.ts` - API base URL constant

## Test URLs

**RTSP Example:**
```
rtsp://admin:Calin2003!@192.168.1.135:554/cam/realmonitor?channel=1&subtype=1
```

**MJPEG Example:**
```
http://192.168.1.100:8080/stream
```

**HLS Example:**
```
http://192.168.1.100:8080/live.m3u8
```

## Troubleshooting

**"No cameras in dropdown"**
- Did you create cameras first?
- Is backend API accessible at NEXT_PUBLIC_API_BASE?

**"Failed to load stream"**
- Check camera URL is correct
- Verify backend can reach camera (not just frontend)
- For RTSP: ensure FFmpeg installed on backend

**"Blank screen in live feed"**
- Check browser dev console for errors
- Verify camera is recording/streaming
- Try accessing camera directly in browser

## Need Help?

- See `CAMERA_INTEGRATION_GUIDE.md` for detailed setup
- See `CODE_CHANGES.md` for exact code modifications
- See `IMPLEMENTATION_COMPLETE.md` for complete details
