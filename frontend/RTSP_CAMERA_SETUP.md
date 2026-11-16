# RTSP Camera Setup Guide

## Your Camera URL
```
rtsp://admin:Calin2003@192.168.0.101/cam/realmonitor?channel=1&subtype=1
```

## Quick Start

### 1. Test RTSP Connection First

Before adding the camera to the system, test the connection:

**Using PowerShell:**
```powershell
$url = "rtsp://admin:Calin2003@192.168.0.101/cam/realmonitor?channel=1&subtype=1"
$body = @{
    url = $url
    timeout = 10
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3001/api/cameras/test-rtsp" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body
```

**Using cURL (Windows Command Prompt):**
```bash
curl -X POST http://localhost:3001/api/cameras/test-rtsp ^
  -H "Content-Type: application/json" ^
  -d "{\"url\": \"rtsp://admin:Calin2003@192.168.0.101/cam/realmonitor?channel=1&subtype=1\", \"timeout\": 10}"
```

### 2. Add Camera to System

Once the connection test passes, add the camera:

**Using PowerShell:**
```powershell
$camera = @{
    name = "Main Camera"
    location = "Factory Floor"
    stream_url = "rtsp://admin:Calin2003@192.168.0.101/cam/realmonitor?channel=1&subtype=1"
    mode = "rtsp"
    notes = "IP Camera - Dahua"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3001/api/cameras" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body $camera
```

### 3. View Live Stream

Navigate to the **Live** page in the application and the stream should display automatically.

## Understanding the Stream Parameters

When the frontend loads a camera with `mode: "rtsp"`, it automatically:

1. **Encodes the URL** - Handles special characters, credentials, and query parameters correctly
2. **Converts to MJPEG** - Uses FFmpeg to transcode RTSP → MJPEG for browser compatibility
3. **Applies quality settings** - Can adjust resolution and frame rate

### URL Query Parameters (Optional)

```
GET /api/stream/rtsp?url={ENCODED_URL}&cameraId=1&quality=medium&transport=tcp

Parameters:
- url (required): The RTSP URL (URL-encoded)
- cameraId (optional): Camera ID for session tracking
- quality (optional): low | medium | high (default: medium)
  - low: 640x360 @ 5fps
  - medium: 1280x720 @ 10fps
  - high: 1920x1080 @ 15fps
- transport (optional): tcp | udp (default: tcp)
```

## If Stream Doesn't Work

### Troubleshooting Steps

1. **Test Connection First**
   ```powershell
   # Run the test endpoint (see "Test RTSP Connection First" above)
   ```

2. **Check Basic Camera Access**
   - Open a terminal and test with FFmpeg directly:
   ```powershell
   ffmpeg -rtsp_transport tcp -i "rtsp://admin:Calin2003@192.168.0.101/cam/realmonitor?channel=1&subtype=1" -t 5 -f null -
   ```

3. **Try Different Transport Method**
   - Some cameras prefer UDP. Modify the stream URL query to use UDP:
   ```
   /api/stream/rtsp?url={URL}&transport=udp
   ```

4. **Check Network**
   ```powershell
   Test-NetConnection -ComputerName 192.168.0.101 -Port 554
   ```
   - Should show `TcpTestSucceeded: True`

5. **Verify Credentials**
   - Make sure username and password are correct
   - Try accessing the camera web interface: `http://192.168.0.101`

6. **Check Camera Settings**
   - Some IP cameras have RTSP disabled by default
   - Enable RTSP in camera settings via web interface
   - Verify the stream path (`/cam/realmonitor` in your case)

### Common Issues

| Issue | Solution |
|-------|----------|
| "Connection timeout" | Increase timeout: use `&timeout=20` or check camera IP |
| "Stream failed to connect" | Try `transport=udp` parameter |
| "No image appears" | Check FFmpeg logs in terminal for details |
| "Connection refused" | Camera may be offline or firewall blocking port 554 |
| "Authentication failed" | Verify credentials in the RTSP URL |

## Quality Presets

When using the stream, you can specify quality via the `quality` parameter:

- **low** - 640x360 @ 5fps (minimal bandwidth, good for monitoring)
- **medium** - 1280x720 @ 10fps (balanced quality/performance)
- **high** - 1920x1080 @ 15fps (best quality, requires more bandwidth)

Example with quality parameter:
```
/api/stream/rtsp?url={URL}&quality=high
```

## Backend Logs

The backend logs RTSP connection attempts. Watch the server terminal for:

```
[RTSP Stream] New connection request for stream-1708429800123
[RTSP Stream] RTSP URL: rtsp://admin:****@192.168.0.101/cam/realmonitor?channel=1&subtype=1
[RTSP Stream] Transport: tcp, Quality: medium
[RTSP Stream] ✅ Started for stream-1708429800123
```

Red errors like `[RTSP Stream] ❌ Error` indicate connection issues to troubleshoot.

## Tips

- **Don't expose credentials** - The /api/stream/rtsp endpoint hides credentials in logs
- **Persistent issues?** - Check camera logs/web interface for connection limits
- **Multiple cameras** - Each gets a unique sessionId to prevent conflicts
- **Performance** - Lower quality settings for slower networks
