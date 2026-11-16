# Implementation Verification Checklist

## Environment Setup
- [ ] `.env.local` has `NEXT_PUBLIC_API_BASE=http://localhost:3001`
- [ ] Backend server running and accessible at configured URL
- [ ] Backend has camera endpoints (GET, POST, PUT, DELETE /api/cameras)
- [ ] Backend stations support camera fields (camera_id, camera_mode, camera_stream_url, expected_operator_name)
- [ ] Backend has RTSP proxy endpoint (GET /api/stream/rtsp?url=...&cameraId=...)

## Code Changes Verified
- [ ] `/lib/api.ts` uses `NEXT_PUBLIC_API_BASE` (not `NEXT_PUBLIC_API_URL`)
- [ ] `/app/stations/page.tsx`:
  - [ ] Camera form state initialized with empty string (not "None")
  - [ ] Camera dropdown shows ALL cameras in list
  - [ ] Camera display shows name + location
  - [ ] Null handling: `cameraIdVal && cameraIdVal !== ""`
  - [ ] Station cards display camera name
- [ ] `/app/stations/[id]/page.tsx`:
  - [ ] Camera Configuration card shows when camera assigned
  - [ ] Shows camera name, mode, and effective URL
  - [ ] Copy button works for stream URL
  - [ ] Live Feed card displayed below configuration
  - [ ] LiveStreamViewer component receives all props
- [ ] `/components/live-stream-viewer.tsx`:
  - [ ] Uses `API_BASE` constant correctly
  - [ ] RTSP proxy URL computed correctly
  - [ ] Image loading state visible
  - [ ] Error state with URL preview
  - [ ] Full-screen toggle works
  - [ ] Aspect ratio maintained

## Functional Testing

### Creating Cameras
- [ ] Go to Cameras page (or use API)
- [ ] Create camera with:
  - [ ] Name: "Test Camera"
  - [ ] Location: "Test Location"
  - [ ] Stream URL: Valid MJPEG/RTSP/HLS URL
  - [ ] Mode: Matching stream type
- [ ] Camera appears in database

### Station Management
- [ ] Create new station:
  - [ ] Fill form (name, type, etc.)
  - [ ] Camera Assignment dropdown shows created camera
  - [ ] Select camera from dropdown
  - [ ] Camera Mode defaults to camera's mode
  - [ ] Submit form
  - [ ] Station created with camera_id assigned
- [ ] Edit existing station:
  - [ ] Camera Assignment shows current selection
  - [ ] Can change to different camera
  - [ ] Can clear camera (set to None)
  - [ ] Changes saved correctly
- [ ] List page displays:
  - [ ] Camera name on station card (if assigned)
  - [ ] "No camera assigned" if unassigned

### Live Feed Display
- [ ] Go to station with camera:
  - [ ] "Camera Configuration" card visible
  - [ ] Shows correct camera name
  - [ ] Shows correct stream mode
  - [ ] Effective URL displayed and copyable
  - [ ] Copy button copies to clipboard
- [ ] Live Feed section:
  - [ ] Video/stream appears (or loading spinner)
  - [ ] For MJPEG: <img> element loads
  - [ ] For HLS: <video> element plays
  - [ ] For RTSP: Proxied through /api/stream/rtsp
  - [ ] For WebRTC: Shows "coming soon" message
- [ ] Full-screen:
  - [ ] Maximize button visible
  - [ ] Opens full-screen overlay
  - [ ] Minimize button closes full-screen
  - [ ] Stream still displays in full-screen

### Error Handling
- [ ] Invalid stream URL:
  - [ ] Shows error in live feed
  - [ ] Error message visible
  - [ ] URL preview shown
- [ ] Backend unreachable:
  - [ ] Stations page shows connection error
  - [ ] Camera dropdown empty
  - [ ] Graceful degradation
- [ ] RTSP without FFmpeg:
  - [ ] Backend returns error
  - [ ] Frontend shows appropriate message

### API Integration
- [ ] POST /api/stations sends correct payload:
  - [ ] `camera_id`: integer or null
  - [ ] `camera_mode`: string (mjpeg|hls|webrtc|rtsp)
  - [ ] `camera_stream_url`: string or null
  - [ ] `expected_operator_name`: string or null
  - [ ] All fields use snake_case
- [ ] GET /api/stations returns:
  - [ ] `camera_id`: assigned camera ID
  - [ ] `camera_name`: camera's name
  - [ ] `camera_stream_url_default`: camera's stream URL
  - [ ] `camera_stream_url`: station override (if any)
  - [ ] `camera_mode`: selected mode
- [ ] RTSP Proxy:
  - [ ] GET /api/stream/rtsp converts RTSP to MJPEG
  - [ ] Multiple concurrent streams supported
  - [ ] Proper error handling

## Data Consistency
- [ ] Creating station without camera works
- [ ] Creating station with camera works
- [ ] Updating camera_id to null removes camera
- [ ] Stream URL override takes precedence
- [ ] Default stream URL used when no override
- [ ] Expected operator name persists

## UI/UX Quality
- [ ] No visual glitches or layout shifts
- [ ] All text is readable and properly styled
- [ ] Colors follow design system
- [ ] Responsive on mobile/tablet/desktop
- [ ] Loading states clear and obvious
- [ ] Error states helpful and clear
- [ ] Full-screen experience seamless

## Performance
- [ ] Page loads quickly
- [ ] Camera dropdown doesn't lag with many cameras
- [ ] Live feed doesn't block UI updates
- [ ] Multiple concurrent streams don't crash app

## Browser Compatibility
- [ ] Works in Chrome/Chromium
- [ ] Works in Firefox
- [ ] Works in Safari
- [ ] Works in Edge

## Documentation
- [ ] START_HERE.md provides quick setup
- [ ] CAMERA_INTEGRATION_GUIDE.md comprehensive
- [ ] CODE_CHANGES.md shows exact modifications
- [ ] IMPLEMENTATION_COMPLETE.md detailed explanation

---

## Sign-Off

- [ ] All items checked
- [ ] Ready for production deployment
- [ ] No breaking changes to existing features
- [ ] Backward compatible with existing stations

**Date Completed:** _______________
**Tested By:** _______________
