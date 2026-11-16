# Quick Start: Add Your IP Camera in 5 Minutes

## Your Setup
- **IP Camera**: Dahua Hero A1
- **IP Address**: `192.168.0.101`
- **Username**: `admin`
- **Password**: `Calin2003`
- **Local Backend**: `http://localhost:3001`

⚠️ **IMPORTANT**: Your original URL is missing the `:554` port. See [DAHUA_HERO_A1_SETUP.md](DAHUA_HERO_A1_SETUP.md) for the correct URLs.

## 🚀 Quick Start (Do This First)

### Step 1: Start the Backend (if not already running)

**Option A: PowerShell**
```powershell
cd backend
npm run dev
```

You should see:
```
[Database] Connected successfully: <timestamp>
[Server] Factory Manager Backend running on port 3001
```

**Option B: Windows Command Prompt**
```cmd
cd backend
npm run dev
```

### Step 2: Run Diagnostic Test

**For Dahua Hero A1 Cameras - IMPORTANT:**

Use the dedicated Dahua test script that tests multiple URL formats:

```powershell
.\test-dahua-hero-a1.ps1
```

This will:
- ✅ Check if camera IP is reachable
- ✅ Test backend API connection
- ✅ Try 4 different RTSP URLs for Dahua cameras
- ✅ Show which URLs work with your camera
- ✅ Provide the correct URL to use

**Wait for results** (takes ~20-40 seconds - tests multiple streams)

**For other cameras:**
```powershell
.\test-rtsp.ps1
```

---

**KEY ISSUE FOUND**: Your original URL was missing the `:554` port!

**Wrong**: `rtsp://admin:Calin2003@192.168.0.101/cam/realmonitor?channel=1&subtype=1`
**Correct**: `rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=1&subtype=0`

See [DAHUA_HERO_A1_SETUP.md](DAHUA_HERO_A1_SETUP.md) for details.

### Step 3: Add Camera to System

**After the test finishes, it will suggest a working URL.**

The test should find a URL like:
```
rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=1&subtype=0
```

Copy that working URL and use it here:

```powershell
$camera = @{
    name = "Dahua Hero A1"
    location = "Factory Floor"
    stream_url = "rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=1&subtype=0"
    mode = "rtsp"
    notes = "Hero A1 - Main Stream"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3001/api/cameras" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body $camera -TimeoutSec 10
```

**Replace the `stream_url` with the URL from your test results!**

**You should get a response like:**
```json
{
  "id": 1,
  "name": "Main Camera",
  "location": "Factory Floor",
  "stream_url": "rtsp://...",
  "mode": "rtsp",
  "created_at": "2026-02-20..."
}
```

### Step 4: View Live Stream

1. Open your application in browser: `http://localhost:3000`
2. Navigate to the **Live** or **Cameras** page
3. You should see **"Main Camera"** with the live feed

✅ **Done!**

---

## 🚨 If It Doesn't Work

### Symptom 1: "Connection timeout" from test script

**Cause**: Camera IP is not reachable

**Fix**:
1. Verify camera IP is correct: `192.168.0.101`
2. Check camera is powered on and connected to network
3. Ping the camera from PowerShell:
   ```powershell
   Test-NetConnection -ComputerName 192.168.0.101 -Port 554
   ```
   Should show `TcpTestSucceeded : True`

4. If ping fails, check your network/firewall

### Symptom 2: "Authentication failed" or "Invalid credentials"

**Cause**: Username/password is wrong

**Fix**:
1. Verify credentials: `admin:Calin2003`
2. Check if credentials changed recently
3. Try checking if another port works for camera access:
   - Browser: `http://192.168.0.101` (default port 80)
   - Or: `http://192.168.0.101:8080`
   - Or: `http://192.168.0.101:8000`
4. If camera web interface loads, login with `admin:Calin2003`
5. If login fails, the credentials may be wrong - you may need to reset the camera

### Symptom 3: "RTSP not supported" from FFmpeg

**Cause**: Camera RTSP is disabled or uses different path

**Fix**:
1. Try accessing camera admin interface if available:
   - Open browser: `http://192.168.0.101` (may not work if no web interface)
   - Or try port 8080: `http://192.168.0.101:8080`
   - Or try port 8000: `http://192.168.0.101:8000`
2. If web interface loads, look for settings like:
   - Network Settings → RTSP
   - Video Streaming → RTSP
3. Enable RTSP if disabled
4. Note the alternative stream paths (sometimes cameras have `/stream1`, `/live`, etc.)
5. Update the URL in the camera creation

### Symptom 4: Backend won't start or crashes

**Cause**: Missing FFmpeg or node modules

**Fix**:
```powershell
cd backend
npm install
npm run dev
```

If you get FFmpeg errors, ensure `ffmpeg` is installed on your system.

### Symptom 5: Web UI shows camera but stream doesn't load

**Cause**: Firewall or backend streaming issue

**Fix**:
1. Check backend logs (your terminal running `npm run dev`) for `[RTSP Stream]` errors
2. Try using UDP transport instead of TCP:
   - Edit camera in web UI (if available)
   - Or modify the stream URL query parameter  
3. Try lower quality setting:
   - Current: `medium` (1280x720)
   - Try: `low` (640x360) or `high` (1920x1080)

---

## 📚 Detailed Documentation

- **Dahua Hero A1 Setup**: [DAHUA_HERO_A1_SETUP.md](DAHUA_HERO_A1_SETUP.md) - **READ THIS FOR YOUR CAMERA**
- **General Setup Guide**: [RTSP_CAMERA_SETUP.md](RTSP_CAMERA_SETUP.md)
- **API Reference**: [RTSP_API_REFERENCE.md](RTSP_API_REFERENCE.md)
- **Test Scripts**: 
  - `.\test-dahua-hero-a1.ps1` (For Dahua cameras - RECOMMENDED)
  - `.\test-rtsp.ps1` (For generic RTSP cameras)

---

## 🔧 Manual Testing (Advanced)

### Test with FFmpeg directly:

```powershell
ffmpeg -rtsp_transport tcp -timeout 5000000 `
  -i "rtsp://admin:Calin2003@192.168.0.101/cam/realmonitor?channel=1&subtype=1" `
  -t 5 -f null -
```

This shows raw FFmpeg errors if RTSP doesn't work.

### Test with cURL:

```powershell
curl -i "http://localhost:3001/api/stream/rtsp?url=rtsp%3A%2F%2Fadmin%3ACalin2003%40192.168.0.101%2Fcam%2Frealmonitor%3Fchannel%3D1%26subtype%3D1"
```

This should return binary MJPEG stream data (not human readable).

---

## 💡 Tips

1. **Start simple**: Test with the diagnostic script first before adding to database
2. **Save credentials**: Your URL is specific to your camera - don't share it
3. **Network**: Ensure backend server and camera are on same network or accessible
4. **Logs**: Watch backend terminal (`npm run dev` window) for `[RTSP Stream]` logs
5. **Quality**: Use `low` quality for slow networks, `high` for LAN

---

## ✅ Success Checklist

- [ ] Backend is running (`npm run dev`)
- [ ] Test script passes all 4 tests  
- [ ] Camera added to system via API
- [ ] Camera appears in web UI
- [ ] Live stream loads and shows video
- [ ] No errors in backend console logs

---

## 📞 Still Not Working?

Collect this information for debugging:
1. Output from `.\test-rtsp.ps1`
2. Errors from backend console (the `npm run dev` window)
3. Browser console errors (F12 in browser)
4. Your camera model and firmware version (from web interface)

Then check [RTSP_CAMERA_SETUP.md](RTSP_CAMERA_SETUP.md) troubleshooting section.

---

**Last Updated**: Feb 20, 2026
**Status**: Ready to use with all improvements implemented
