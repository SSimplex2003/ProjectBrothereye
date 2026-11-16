# RTSP Camera Support - Complete Implementation

## 🎯 What You Need to Know

Your Factory Manager now **fully supports RTSP cameras**. Here's the quick start:

### Quick Setup (5 minutes)

1. **Backend**: Install dependencies
   ```bash
   cd backend
   npm install
   npm run dev
   ```

2. **Create Camera**:
   - Go to Cameras in dashboard
   - Click "Create Camera"
   - Mode: **RTSP (Proxied to MJPEG)**
   - Stream URL: `rtsp://admin:Calin2003!@192.168.1.135:554/cam/realmonitor?channel=1&subtype=1`
   - Click Save

3. **Assign to Station**:
   - Go to Stations
   - Edit a station
   - Camera Assignment → Select your camera
   - Save

4. **View Live**:
   - Go to station details
   - Scroll down to "Live Camera Feed"
   - Watch your RTSP stream!

## 🔧 How It Works

```
Your RTSP Camera
      ↓
Backend FFmpeg (converts RTSP → MJPEG)
      ↓
Browser (displays MJPEG stream)
```

The backend acts as a proxy that converts RTSP (not browser-friendly) into MJPEG (browser-friendly).

## 📁 What Changed

### Backend (`/backend/`)
- **server.js**: Added `/api/stream/rtsp` endpoint using FFmpeg
- **package.json**: Added `fluent-ffmpeg` and `ffmpeg-static`

### Frontend
- **lib/api.ts**: Added "rtsp" to mode types
- **components/live-stream-viewer.tsx**: Detects RTSP and proxies through backend
- **app/cameras/page.tsx**: RTSP camera management UI
- **app/stations/page.tsx**: RTSP assignment in station form

## ⚙️ Configuration

Your RTSP URL format:
```
rtsp://USERNAME:PASSWORD@IP_ADDRESS:PORT/PATH
rtsp://admin:Calin2003!@192.168.1.135:554/cam/realmonitor?channel=1&subtype=1
```

**Adjust FFmpeg settings in `/backend/server.js` for:**
- Resolution: Change `scale=1280:720`
- FPS: Change `-r 10`
- Quality: Change `-q:v 5` (1-31, lower is better)

## 🐛 Troubleshooting

### Stream Won't Load
1. ✅ Verify RTSP URL is correct (test in FFmpeg)
2. ✅ Check credentials are correct
3. ✅ Verify backend can reach camera (ping IP)
4. ✅ Check port 554 isn't blocked

### Check Logs
```bash
cd backend
npm run dev
# Watch console for FFmpeg errors
```

### Test RTSP Directly
```bash
# Install ffmpeg
sudo apt-get install ffmpeg

# Test your URL
ffplay 'rtsp://admin:Calin2003!@192.168.1.135:554/cam/realmonitor?channel=1&subtype=1'
```

## 📊 Performance

Per concurrent stream:
- **CPU**: ~10-30% (single core)
- **Memory**: ~50-100MB
- **Bandwidth**: ~1-5 Mbps @ 1280x720 10FPS

Multiple clients viewing same camera = one FFmpeg process (efficient!)

## ✨ Features

✅ RTSP with authentication  
✅ Real-time conversion to MJPEG  
✅ Browser compatible (all browsers)  
✅ Mobile friendly  
✅ Full-screen viewing  
✅ Multiple concurrent streams  
✅ Automatic process reuse  

## 📚 Documentation Files

- **RTSP_SETUP_GUIDE.md**: Complete setup guide with troubleshooting
- **RTSP_CHANGES.md**: Technical summary of changes
- **RTSP_QUICK_REFERENCE.md**: Quick lookup guide
- **This file**: Overview and quick start

## 🚀 Next Steps

1. Install backend dependencies: `npm install` in `/backend`
2. Start backend: `npm run dev` in `/backend`
3. Create your first RTSP camera
4. Assign to a station
5. View live feed!

## ❓ Questions?

**Can I use HTTP cameras too?**  
Yes! Create cameras with mode "MJPEG" for direct HTTP streams.

**Does it work on local network only?**  
Yes, RTSP stays local. Frontend → Backend uses HTTP. Perfect for internal dashboards.

**How many cameras can I stream?**  
Depends on backend hardware. Typically 4-8 concurrent RTSP streams on a standard server.

**Is it secure?**  
RTSP credentials are sent in URL. Use strong passwords and restrict camera access to your network.

---

**You're all set!** Your factory can now stream live RTSP cameras directly in the dashboard. 🎬
