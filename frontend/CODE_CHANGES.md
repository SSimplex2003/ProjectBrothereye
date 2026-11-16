# Exact Frontend Code Changes

## Files Modified

### 1. `/lib/api.ts`
**Line 1 - Changed:**
```typescript
// OLD:
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

// NEW:
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001"
```

---

### 2. `/app/stations/page.tsx`

**Lines 273 - Camera form state initialization:**
```typescript
// OLD:
const [selectedCameraId, setSelectedCameraId] = useState<string>(station?.camera_id?.toString() || "None")

// NEW:
const [selectedCameraId, setSelectedCameraId] = useState<string>(station?.camera_id?.toString() || "Unassigned")
```

**Lines ~350-360 - Camera dropdown:**
```typescript
// OLD:
<SelectItem value="None">None</SelectItem>
{station?.camera_id && cameras.map((camera) => (
  <SelectItem key={camera.id} value={camera.id.toString()}>
    {camera.name} ({camera.mode.toUpperCase()})
  </SelectItem>
))}

// NEW:
<SelectItem value="Unassigned">None</SelectItem>
{cameras.map((camera) => (
  <SelectItem key={camera.id} value={camera.id.toString()}>
    {camera.name} ({camera.location || "no location"})
  </SelectItem>
))}
```

**Lines ~364 - Conditional rendering:**
```typescript
// OLD:
{selectedCameraId !== "None" && (

// NEW:
{selectedCameraId !== "Unassigned" && (
```

**Lines 45-70 - Create and Update handlers:**
```typescript
// OLD:
camera_id: formData.get("camera_id") ? parseInt(formData.get("camera_id") as string) : null,

// NEW:
const cameraIdVal = formData.get("camera_id") as string
camera_id: cameraIdVal && cameraIdVal !== "" ? parseInt(cameraIdVal) : null,

// Also ensure cycle_template_id check:
cycle_template_id: formData.get("cycle_template_id") && formData.get("cycle_template_id") !== "" ? parseInt(...) : null,
```

**Lines ~195-200 - Station card display:**
```typescript
// OLD:
{station.camera_id ? (
  <div className="text-sm text-status-working mb-2 font-medium flex items-center gap-1">
    <div className="h-2 w-2 rounded-full bg-status-working" />
    Camera assigned
  </div>
) : (
  <div className="text-sm text-muted-foreground/70 mb-2">No camera assigned</div>
)}

// NEW:
{station.camera_id && station.camera_name ? (
  <div className="text-sm text-status-working mb-2 font-medium flex items-center gap-1">
    <div className="h-2 w-2 rounded-full bg-status-working" />
    {station.camera_name}
  </div>
) : (
  <div className="text-sm text-muted-foreground/70 mb-2">No camera assigned</div>
)}
```

---

### 3. `/app/stations/[id]/page.tsx`

**After Station Info Card, add Camera Configuration Card:**

```typescript
{/* Camera Configuration Card */}
{station.camera_id ? (
  <Card className="border-border bg-card">
    <CardHeader>
      <CardTitle className="text-foreground">Camera Configuration</CardTitle>
      <CardDescription>Live monitoring setup for this station</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label className="text-muted-foreground">Camera Name</Label>
          <p className="text-foreground font-medium">{station.camera_name || "Unknown"}</p>
        </div>
        <div>
          <Label className="text-muted-foreground">Stream Mode</Label>
          <p className="text-foreground font-medium uppercase">{station.camera_mode}</p>
        </div>
      </div>
      <div>
        <Label className="text-muted-foreground">Effective Stream URL</Label>
        <div className="flex gap-2 items-center mt-2">
          <code className="flex-1 block p-2 bg-muted rounded text-xs text-foreground break-all">
            {station.camera_stream_url || station.camera_stream_url_default || "Not configured"}
          </code>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              const url = station.camera_stream_url || station.camera_stream_url_default
              if (url) navigator.clipboard.writeText(url)
            }}
            className="bg-transparent"
          >
            Copy
          </Button>
        </div>
      </div>
    </CardContent>
  </Card>
) : (
  <Card className="border-border bg-card border-dashed">
    <CardHeader>
      <CardTitle className="text-muted-foreground">No Camera Assigned</CardTitle>
      <CardDescription>Configure a camera to enable live monitoring</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">
        Go to Stations page and edit this station to assign a camera.
      </p>
    </CardContent>
  </Card>
)}

{/* Live Feed Display */}
{station.camera_id && (station.camera_stream_url || station.camera_stream_url_default) && (
  <Card className="border-border bg-card">
    <CardHeader>
      <CardTitle className="text-foreground">Live Feed</CardTitle>
      <CardDescription>Real-time camera stream</CardDescription>
    </CardHeader>
    <CardContent>
      <LiveStreamViewer
        cameraName={station.name}
        streamUrl={station.camera_stream_url || station.camera_stream_url_default || ""}
        mode={station.camera_mode}
        cameraId={station.camera_id}
        isFullscreen={false}
        onFullscreenChange={setIsFullscreen}
      />
    </CardContent>
  </Card>
)}
```

---

### 4. `/components/live-stream-viewer.tsx`

**Complete file replacement** (see CAMERA_QUICK_REF.md for full component)

Key changes:
- Use `NEXT_PUBLIC_API_BASE` constant
- Simplified logic: no Card wrapper inside, returns raw content
- Proper RTSP proxy: `GET /api/stream/rtsp?url=${encodeURIComponent(url)}&cameraId=${id}`
- Better error handling with URL preview
- Aspect ratio container for responsive video

---

## Environment Variables

**Add to `.env.local`:**
```env
NEXT_PUBLIC_API_BASE=http://localhost:3001
```

---

## Summary of Logic Changes

1. **Camera Dropdown**: Now shows ALL cameras, not just currently selected one
2. **Null Handling**: Empty strings converted to null before API calls
3. **Effective URL**: Computed as `station.camera_stream_url || station.camera_stream_url_default`
4. **RTSP Proxy**: Automatic conversion for RTSP mode streams
5. **Display**: Clear separation of camera config info vs live feed vs no camera state

All changes maintain backward compatibility with existing stations.
