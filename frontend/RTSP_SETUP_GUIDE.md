# RTSP Camera Integration Guide

## Overview

Your Factory Manager now fully supports RTSP (Real Time Streaming Protocol) cameras commonly used in IP surveillance systems. RTSP streams are automatically converted to MJPEG by the backend, making them compatible with all browsers.

## Supported RTSP URL Formats

Your RTSP camera URL: `rtsp://admin:Calin2003!@192.168.1.135:554/cam/realmonitor?channel=1&subtype=1`

### Common RTSP URL Patterns

**Hikvision Cameras:**
```
rtsp://admin:password@camera-ip:554/cam/realmonitor?channel=1&subtype=1
rtsp://admin:password@camera-ip:554/Streaming/Channels/101
```

**Dahua Cameras:**
```
rtsp://admin:password@camera-ip:554/stream/ch0
rtsp://admin:password@camera-ip:554/live/0
```

**Reolink Cameras:**
```
rtsp://admin:password@camera-ip:554/h264Preview_01_main
rtsp://admin:password@camera-ip:554/h265Preview_01_main
```

**Generic Cameras:**
```
rtsp://admin:password@camera-ip:554/live1
rtsp://admin:password@camera-ip:554/stream1
```

## How RTSP Streaming Works

1. **Frontend Request**: You select a camera with RTSP mode in the UI
2. **Browser Call**: Frontend calls `/api/stream/rtsp?url=YOUR_RTSP_URL&cameraId=CAMERA_ID`
3. **Backend Conversion**: FFmpeg converts RTSP → MJPEG in real-time
4. **Stream Display**: Browser receives MJPEG stream and displays it

## Setting Up an RTSP Camera

### Step 1: Create Camera in Dashboard

1. Go to **Cameras** in the sidebar
2. Click **+ Create Camera**
3. Fill in the following:
   - **Name**: e.g., "Station 1 Camera" or "Assembly Line A"
   - **Location**: e.g., "Bay 3" (optional)
   - **Mode**: Select **RTSP (Proxied to MJPEG)**
   - **Stream URL**: Paste your RTSP URL with credentials
   - **Notes**: Any relevant info (optional)

### Step 2: Assign to Station

1. Go to **Stations** in the sidebar
2. Edit an existing station or create a new one
3. Scroll to **Camera Assignment** section
4. **Select Camera**: Choose the RTSP camera you created
5. **Camera Mode**: Should auto-populate with RTSP
6. **Stream URL Override**: Leave empty to use camera's default URL (or override if needed)
7. Save the station

### Step 3: View Live Feed

1. Go to **Stations**
2. Click the station card to view details
3. Scroll down to see the **Live Camera Feed**
4. Click the maximize icon to view in full-screen

## Troubleshooting

### "Failed to load stream" Error

**Problem**: Camera stream won't display

**Solutions**:
1. **Check URL Format**: Verify RTSP URL is correct
   ```bash
   # Test from command line (if you have ffmpeg)
   ffplay rtsp://admin:password@192.168.1.135:554/cam/realmonitor?channel=1&subtype=1
   ```

2. **Check Credentials**: Ensure username and password are correct
   - Test login directly on camera web interface

3. **Network Connectivity**: Verify backend can reach camera
   ```bash
   # From your server
   ping 192.168.1.135
   telnet 192.168.1.135 554
   ```

4. **Firewall Rules**: Check if RTSP port (554) is open
   - Some networks block RTSP - may need to open port 554

5. **Backend Logs**: Check backend console for detailed errors
   ```
   [RTSP Stream] Error for camera-1: Connection timeout
   [RTSP Stream] Error for camera-1: Permission denied
   ```

### Stream Freezes or Lags

**Problem**: Video is choppy or freezes

**Solutions**:
1. **Reduce Quality**: FFmpeg uses `scale=1280:720 -r 10 FPS`
2. **Reduce Substreams**: Use lower resolution substream if available
3. **Bandwidth**: Check network bandwidth to backend server
4. **Backend Resources**: Ensure backend has CPU/memory available

### Multiple Clients Streaming Same Camera

**Problem**: Multiple users viewing same camera, high CPU usage

**Solution**: The backend maintains one FFmpeg process per unique camera, so multiple clients share the same stream. This is optimized.

## Performance Considerations

### CPU Usage
- Each active RTSP stream uses ~10-30% CPU (single core)
- FFmpeg quality settings:
  - `-q:v 5`: Higher quality, more CPU
  - `-q:v 7`: Balanced (default)
  - `-q:v 9`: Lower quality, less CPU

### Memory Usage
- ~50-100MB per active stream

### Bandwidth
- ~1-5 Mbps per stream at 1280x720 @ 10 FPS

## Advanced Configuration

### Modifying Stream Quality

Edit `/backend/server.js`, find the RTSP endpoint, and adjust:

```javascript
.outputOptions([
  "-f", "mjpeg",
  "-q:v", "5",           // Adjust quality (1-31, lower = better)
  "-vf", "scale=1280:720", // Change resolution
  "-r", "10",            // Change FPS
])
```

### Limiting Concurrent Streams

Add max streams check:
```javascript
if (streamSessions.size >= MAX_STREAMS) {
  return res.status(503).json({ error: "Max concurrent streams reached" })
}
```

## Testing Your Setup

### 1. Test RTSP URL Directly (on backend server)

```bash
# Install ffmpeg if needed
sudo apt-get install ffmpeg  # Ubuntu/Debian
brew install ffmpeg           # macOS

# Test stream
ffplay 'rtsp://admin:Calin2003!@192.168.1.135:554/cam/realmonitor?channel=1&subtype=1'
```

### 2. Test Backend Endpoint

```bash
# From your terminal
curl -v 'http://localhost:3001/api/stream/rtsp?url=rtsp%3A%2F%2Fadmin%3ACalin2003%21%40192.168.1.135%3A554%2Fcam%2Frealmonitor%3Fchannel%3D1%26subtype%3D1&cameraId=1'
```

### 3. Test in Dashboard

1. Create camera with RTSP URL
2. Assign to station
3. View live feed in station details

## FAQ

**Q: Can I use both HTTP and RTSP URLs?**
A: Yes! Create multiple cameras - some with HTTP URLs, some with RTSP. Each station can be assigned any camera.

**Q: Does RTSP work without internet?**
A: Yes! RTSP works on local networks. Frontend → Backend uses HTTP, Backend → Camera uses RTSP.

**Q: Can I view RTSP streams on mobile?**
A: Yes! The MJPEG conversion makes it compatible with all browsers and devices.

**Q: What if my camera uses a different streaming protocol (ONVIF)?**
A: Most IP cameras support RTSP. Check camera documentation for RTSP stream URL. ONVIF is a separate protocol - create an issue if needed.

**Q: How many cameras can I stream simultaneously?**
A: Depends on backend resources. Each stream uses ~1 CPU core. Start with 4-8 concurrent streams on a typical server.

## Security Considerations

### Credentials in URLs

Your RTSP URL contains credentials: `rtsp://admin:password@ip:port/stream`

**Recommendations**:
1. Use strong passwords on cameras
2. Restrict camera access to internal network only
3. Don't expose the dashboard to the internet without HTTPS
4. Consider using a VPN for remote access
5. Store sensitive URLs in environment variables (optional)

### Environment Variable Alternative

Instead of storing URLs in database, use env vars:

```bash
# .env.backend
CAMERA_1_URL=rtsp://admin:password@192.168.1.135:554/...
```

Then reference in code (feature coming soon).

## Support

For issues:
1. Check Backend Logs: `npm run dev` shows FFmpeg errors
2. Test URL directly with FFmpeg
3. Verify network connectivity to camera
4. Check firewall and port settings
5. Review this guide's troubleshooting section

## What's Next

- [ ] Support for RTSP authentication tokens
- [ ] Stream recording capability
- [ ] WebRTC support (direct P2P)
- [ ] HLS stream recording
- [ ] Advanced FFmpeg filters (effects, overlays)
