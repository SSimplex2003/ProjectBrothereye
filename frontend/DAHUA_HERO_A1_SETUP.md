# Dahua Hero A1 RTSP Setup Guide

## Your Camera Information
- **Model**: Dahua Hero A1
- **Current IP**: `192.168.0.101`
- **Username**: `admin`
- **Password**: `Calin2003`

---

## ✅ CORRECT RTSP URLs for Dahua Hero A1

### PRIMARY URL (Main Stream - High Quality)
```
rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=1&subtype=0
```

### SECONDARY URL (Sub-Stream - Lower Quality, More Compatible)
```
rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=1&subtype=1
```

### ALTERNATIVE URL (Profile-Based)
```
rtsp://admin:Calin2003@192.168.0.101:554/stream/profile1
```

---

## 🔴 WHY YOUR ORIGINAL URL DIDN'T WORK

**Your URL:**
```
rtsp://admin:Calin2003@192.168.0.101/cam/realmonitor?channel=1&subtype=1
```

**Problems:**
1. ❌ **Missing port `:554`** - RTSP default port must be explicit
2. ⚠️ **`subtype=1`** - This is sub-stream (lower quality), might be less compatible
3. ❌ **Missing explicit port** - Some Dahua cameras require `:554`

**Fixed URL:**
```
rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=1&subtype=0
```

---

## 🚀 Quick Setup (Do This Now)

### Step 1: Update Your Backend

No code changes needed - the backend now handles all RTSP URLs correctly.

### Step 2: Test New URLs

**Open PowerShell and test each URL:**

```powershell
# Test URL #1 - Main Stream (TRY THIS FIRST)
$rtspUrl = "rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=1&subtype=0"

$body = @{
    url = $rtspUrl
    timeout = 10
} | ConvertTo-Json

$response = Invoke-WebRequest -Uri "http://localhost:3001/api/cameras/test-rtsp" `
  -Method POST `
  -Headers @{"Content-Type" = "application/json"} `
  -Body $body -TimeoutSec 15

$response.Content | ConvertFrom-Json | ConvertTo-Json
```

**If that fails, test URL #2:**

```powershell
# Test URL #2 - Sub-Stream (Lower Quality)
$rtspUrl = "rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=1&subtype=1"

$body = @{
    url = $rtspUrl
    timeout = 10
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3001/api/cameras/test-rtsp" `
  -Method POST `
  -Headers @{"Content-Type" = "application/json"} `
  -Body $body -TimeoutSec 15 | % {$_.Content | ConvertFrom-Json}
```

---

## 📋 URL Breakdown - Understanding Dahua Parameters

```
rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=1&subtype=0
                                        ↑↑↑                    ↑        ↑
                                      PORT 554          channel=1   subtype=0
```

| Component | Value | Meaning |
|-----------|-------|---------|
| `admin` | Username | Default Dahua admin account |
| `Calin2003` | Password | Your camera password |
| `192.168.0.101` | IP Address | Camera on local network |
| `:554` | RTSP Port | Standard RTSP port (IMPORTANT - wasn't in your original URL) |
| `/cam/realmonitor` | Stream Path | Dahua standard path |
| `channel=1` | Channel | Single camera = 1 |
| `subtype=0` | Stream Type | 0 = Main/High-Quality, 1 = Sub/Low-Quality |

---

## 🔄 URL Variations for Different Scenarios

### If Main Stream Doesn't Work:
Try the sub-stream (lower quality but more compatible):
```
rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=1&subtype=1
```

### If Channel Number is Wrong:
```
rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=2&subtype=0
rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=3&subtype=0
```
(Try channels 1-4 if you have multiple streams configured)

### Alternative Profile Format (Last Resort):
```
rtsp://admin:Calin2003@192.168.0.101:554/stream/profile1
rtsp://admin:Calin2003@192.168.0.101:554/stream/profile2
```

---

## ✅ Steps to Get It Working

### 1. Test Connection
```powershell
# Run this AND wait for result (10-15 seconds)
$rtspUrl = "rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=1&subtype=0"

$body = @{ url = $rtspUrl; timeout = 10 } | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3001/api/cameras/test-rtsp" `
  -Method POST `
  -Headers @{"Content-Type" = "application/json"} `
  -Body $body -TimeoutSec 15 | % {$_.Content}
```

**Expected Success Response:**
```json
{
  "success": true,
  "message": "✅ RTSP connection successful",
  "url": "rtsp://admin:****@192.168.0.101:554/cam/realmonitor?channel=1&subtype=0"
}
```

### 2. Add Camera to System
```powershell
$camera = @{
    name = "Dahua Hero A1"
    location = "Main Factory"
    stream_url = "rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=1&subtype=0"
    mode = "rtsp"
    notes = "Hero A1 - Main Stream"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3001/api/cameras" `
  -Method POST `
  -Headers @{"Content-Type" = "application/json"} `
  -Body $camera -TimeoutSec 10 | % {$_.Content | ConvertFrom-Json | ConvertTo-Json}
```

### 3. View in Web UI
- Open: `http://localhost:3000`
- Go to **Live** or **Cameras** page
- You should see **"Dahua Hero A1"** with live stream

---

## 🔧 Testing with FFmpeg Directly

### Test Main Stream:
```powershell
ffmpeg -rtsp_transport tcp -timeout 5000000 `
  -i "rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=1&subtype=0" `
  -t 5 -f null -
```

### Test Sub-Stream:
```powershell
ffmpeg -rtsp_transport tcp -timeout 5000000 `
  -i "rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=1&subtype=1" `
  -t 5 -f null -
```

If FFmpeg connects successfully, you'll see:
```
[rtsp @ ...] Opening ... for reading
[...] Input #0, rtsp, from 'rtsp://...'
[...] Duration: N/A, start: 0.000000, bitrate: ...
[...] Stream #0:0: Video: ...
frame=  10 fps=0.0 q=-1.0 ...
```

---

## 🚨 Troubleshooting

### Issue: Still Getting `Unrecognized option 'stimeout'`
- ✅ **FIXED** - Backend has been updated to remove invalid FFmpeg options
- Restart backend: `npm run dev`

### Issue: "Connection timeout"
- Verify camera IP: `192.168.0.101`
- Check port 554 is open:
  ```powershell
  Test-NetConnection -ComputerName 192.168.0.101 -Port 554
  # Should show: TcpTestSucceeded : True
  ```

### Issue: "Authentication failed"
- Double-check username: `admin`
- Double-check password: `Calin2003`
- Try accessing web interface: `http://192.168.0.101:8080` or `:8000`

### Issue: Connection works but no video
- Try `subtype=1` (sub-stream) instead of `subtype=0`
- Try using UDP transport: Check streaming settings for transport option

### Issue: "Stream not found"
- Camera might be disabled for RTSP via web interface
- Log into camera: `http://192.168.0.101:8080`
- Enable RTSP under Network Settings

---

## 📝 URL Cheatsheet

| Use Case | URL |
|----------|-----|
| **Main Stream (Start Here)** | `rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=1&subtype=0` |
| **Sub-Stream (If main fails)** | `rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=1&subtype=1` |
| **Profile Format** | `rtsp://admin:Calin2003@192.168.0.101:554/stream/profile1` |
| **Low Bandwidth** | `rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=1&subtype=1` |

---

## ✅ Success Checklist

- [ ] Backend is running with latest fixes (`npm run dev`)
- [ ] Tested connection with `:554` port explicitly
- [ ] RTSP test endpoint returns success
- [ ] Camera added to system via API
- [ ] Camera visible in web UI
- [ ] Live stream displays without errors
- [ ] No `-stimeout` FFmpeg errors in logs

---

## 📞 Still Not Working?

Try these in order:
1. Restart backend: `npm run dev`
2. Test with explicit port: `:554`
3. Try subtype=0, then subtype=1
4. Check FFmpeg works: `ffmpeg -i "rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=1&subtype=0" -t 5 -f null -`
5. Check camera web UI settings for RTSP enable status

---

**Updated**: Feb 20, 2026
**Status**: Ready with Dahua Hero A1 specific URLs
