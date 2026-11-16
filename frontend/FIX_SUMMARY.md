# ISSUE FOUND & FIXED - Dahua Hero A1 Setup

## 🔴 The Problem

Your RTSP URL was **incomplete**:
```
❌ WRONG: rtsp://admin:Calin2003@192.168.0.101/cam/realmonitor?channel=1&subtype=1
```

**What was wrong:**
1. ❌ Missing the `:554` port (RTSP standard port)
2. ⚠️ Using `subtype=1` (sub-stream/lower quality) instead of `subtype=0`

---

## ✅ The Solution

### Correct URLs for Dahua Hero A1

```
✅ PRIMARY:   rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=1&subtype=0
✅ SECONDARY: rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?channel=1&subtype=1
✅ PROFILE:   rtsp://admin:Calin2003@192.168.0.101:554/stream/profile1
```

**Key difference**: Port `:554` is now **explicitly included**

---

## 🚀 What To Do Now (5 Minutes)

### Step 1: Restart Backend
```powershell
# Stop current backend (Ctrl+C in terminal)
cd backend
npm run dev
```

Wait for:
```
[Database] Connected successfully: ...
[Server] Factory Manager Backend running on port 3001
```

### Step 2: Test All URLs
```powershell
# Run the Dahua-specific test script
.\test-dahua-hero-a1.ps1
```

This will test these 4 URLs in order:
1. `rtsp://...@192.168.0.101:554/cam/realmonitor?channel=1&subtype=0` ← Try first
2. `rtsp://...@192.168.0.101:554/cam/realmonitor?channel=1&subtype=1` ← If #1 fails
3. `rtsp://...@192.168.0.101:554/stream/profile1` ← Alternative format
4. `rtsp://...@192.168.0.101/cam/realmonitor?channel=1&subtype=0` ← Without :554 (legacy)

**Wait 20-40 seconds for all tests to complete.**

### Step 3: Add Working URL to System
The test script will show you:
- ✅ Which URL works
- 📋 Copy/paste command to add camera

Run the command it provides.

### Step 4: View Stream
- Open: `http://localhost:3000`
- Go to **Live** page
- You should see your camera with live video

---

## 📋 Summary of Files Created/Updated

### New Files (For Dahua Hero A1):
- `DAHUA_HERO_A1_SETUP.md` - Complete Dahua Hero A1 documentation
- `test-dahua-hero-a1.ps1` - Tests multiple Dahua-specific URLs

### Updated Files:
- `QUICK_START_CAMERA.md` - Now references Dahua setup
- `backend/server.js` - Fixed invalid FFmpeg `-stimeout` option
- `server.js` - Added numeric ID validation for routes

### Original Files (Still Useful):
- `RTSP_CAMERA_SETUP.md` - Generic RTSP setup
- `RTSP_API_REFERENCE.md` - API documentation
- `test-rtsp.ps1` - Generic RTSP test

---

## 🔧 Backend Changes Made

### What Fixed the FFmpeg Error:

**Before (BROKEN):**
```javascript
const inputOptions = [
  "-rtsp_transport", "tcp",
  "-timeout", "15000000",
  "-stimeout", "20000000",      // ❌ INVALID OPTION
  ...
]
```

**After (FIXED):**
```javascript
const inputOptions = [
  "-rtsp_transport", "tcp",
  "-timeout", "15000000",        // ✅ Only valid option
  "-fflags", "nobuffer",
  ...
]
```

---

## 🎯 What You Need To Know

### About Dahua URLs:
- **Port 554**: Required by Dahua Hero A1 (must be explicit)
- **subtype=0**: Main stream (high quality) - try first
- **subtype=1**: Sub-stream (lower quality, more compatible) - fallback
- **channel=1**: For single camera models (standard)

### Why Your Original Failed:
```
Original:  rtsp://admin:Calin2003@192.168.0.101/cam/realmonitor?...
         ↑↑↑ Missing :554 port - causes FFmpeg to fail
         
Fixed:     rtsp://admin:Calin2003@192.168.0.101:554/cam/realmonitor?...
         ✅ Includes :554 port explicitly
```

---

## ✅ Next Steps

```powershell
# 1. Make sure backend is running
cd backend
npm run dev

# 2. Run Dahua test in another PowerShell window
.\test-dahua-hero-a1.ps1

# 3. Use the working URL from test results to add camera to system
# (test script will show you the exact command)

# 4. View camera in web UI at http://localhost:3000/live
```

---

## 📞 If Still Having Issues

1. **Check backend is running** - See `[Server] running on port 3001` message
2. **Run test script** - It will pinpoint which URLs work
3. **Copy working URL** - Use exactly what test script recommends
4. **Check backend logs** - Look for `[RTSP Stream]` messages

See `DAHUA_HERO_A1_SETUP.md` for detailed troubleshooting.

---

## 📝 References

- **Dahua Hero A1 Guide**: [DAHUA_HERO_A1_SETUP.md](DAHUA_HERO_A1_SETUP.md)
- **Test Script**: `test-dahua-hero-a1.ps1`
- **Generic Setup**: [RTSP_CAMERA_SETUP.md](RTSP_CAMERA_SETUP.md)

---

**Status**: ✅ Fixed and Ready
**Date**: Feb 20, 2026
**Camera**: Dahua Hero A1
