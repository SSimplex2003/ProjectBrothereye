# Architecture Overview: Enhanced Factory Manager with Cameras

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js 16)                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐               │
│  │  Dashboard       │    │  Cameras Page    │ (NEW)          │
│  │  /               │    │  /cameras        │               │
│  └──────────────────┘    └──────────────────┘               │
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐               │
│  │  Stations List   │    │  Station Detail  │               │
│  │  /stations       │    │  /stations/[id]  │ (ENHANCED)     │
│  │ (camera badges)  │    │ (live feed)      │               │
│  └──────────────────┘    └──────────────────┘               │
│                                                              │
│  ┌──────────────────────────────────────────┐               │
│  │  Live Stream Viewer Component            │ (NEW)          │
│  │  - MJPEG, HLS, WebRTC support           │               │
│  │  - Full-screen mode                     │               │
│  └──────────────────────────────────────────┘               │
│                                                              │
│  SWR Data Fetching Layer (useSWR hooks)                     │
│  └─ fetchCameras()                                          │
│  └─ fetchStations()                                         │
│  └─ camera CRUD operations                                 │
│                                                              │
└──────────────────────┬───────────────────────────────────────┘
                       │ HTTP/REST API
                       │ JSON over HTTPS
                       │
        ┌──────────────▼───────────────┐
        │  Backend (Node.js/Express)   │ (ENHANCED)
        ├──────────────────────────────┤
        │                              │
        │  ┌───────────────────────┐   │
        │  │  Camera Endpoints     │   │ NEW
        │  │ - GET /api/cameras    │   │
        │  │ - POST /api/cameras   │   │
        │  │ - PUT /api/cameras    │   │
        │  │ - DELETE /api/cameras │   │
        │  └───────────────────────┘   │
        │                              │
        │  ┌───────────────────────┐   │
        │  │  Station Endpoints    │   │ ENHANCED
        │  │ (with camera fields)  │   │
        │  └───────────────────────┘   │
        │                              │
        │  ┌───────────────────────┐   │
        │  │  Original Endpoints   │   │
        │  │ (Workers, Shifts,     │   │ PRESERVED
        │  │  Planning, etc.)      │   │
        │  └───────────────────────┘   │
        │                              │
        │  Error Handling & Logging    │ IMPROVED
        │  CORS Configuration          │
        │  Input Validation            │
        │                              │
        └──────────────┬───────────────┘
                       │ TCP/IP
                       │ PostgreSQL Protocol
                       │
        ┌──────────────▼───────────────┐
        │  PostgreSQL Database         │
        ├──────────────────────────────┤
        │                              │
        │  ┌────────────────────────┐  │
        │  │  cameras table (NEW)   │  │
        │  │ - id (PK)              │  │
        │  │ - name (UNIQUE)        │  │
        │  │ - location             │  │
        │  │ - stream_url           │  │
        │  │ - mode (enum)          │  │
        │  │ - notes                │  │
        │  │ - created_at           │  │
        │  └────────────────────────┘  │
        │                              │
        │  ┌────────────────────────┐  │
        │  │  stations table        │  │ ENHANCED
        │  │ (+ camera fields)      │  │
        │  │ - camera_id (FK)       │  │
        │  │ - camera_mode          │  │
        │  │ - camera_stream_url    │  │
        │  │ - expected_operator    │  │
        │  └────────────────────────┘  │
        │                              │
        │  ┌────────────────────────┐  │
        │  │  Other tables          │  │
        │  │ (Unchanged)            │  │
        │  │ - shifts               │  │
        │  │ - cycle_templates      │  │
        │  │ - cycle_steps          │  │
        │  │ - station_plan         │  │
        │  │ - activity_logs        │  │
        │  │ - alerts               │  │
        │  └────────────────────────┘  │
        │                              │
        │  Indices:                    │ ADDED
        │  - idx_cameras_mode          │
        │  - idx_stations_camera       │
        │  - idx_station_plan_date     │
        │                              │
        └──────────────────────────────┘
```

## Data Flow: Camera Creation

```
User Input (Frontend)
    ↓
Validation (Input component)
    ↓
API Call: POST /api/cameras
    ↓
Backend Validation
  - Camera name required
  - Stream URL required
  - Mode validation (mjpeg|hls|webrtc)
    ↓
Database Insert
  - INSERT INTO cameras (name, location, ...)
  - Check UNIQUE constraint on name
    ↓
Response with New Camera
    ↓
Frontend Update via SWR
    ↓
UI Re-renders (Camera appears in list)
```

## Data Flow: Station-Camera Assignment

```
User Selects Camera for Station
    ↓
Frontend Form
  - Camera dropdown (from fetchCameras)
  - Mode selection (mjpeg|hls|webrtc)
  - URL override (optional)
    ↓
API Call: POST /api/stations or PUT /api/stations/:id
    ↓
Backend
  - Validate camera_id exists
  - Validate mode type
  - Store camera assignment
    ↓
Database Update
  UPDATE stations SET camera_id=1, camera_mode='mjpeg', ...
    ↓
Response with Updated Station
    ↓
Frontend Update via SWR
    ↓
Station Shows Camera Badge
    ↓
Live Feed Appears on Detail Page
```

## API Endpoint Organization

```
/api/cameras (NEW - 5 endpoints)
├── GET / (list all)
├── GET /:id (single camera)
├── POST / (create)
├── PUT /:id (update)
└── DELETE /:id (delete)

/api/stations (ENHANCED - 3 endpoints)
├── GET / (list with camera info)
├── POST / (create with camera assignment)
└── PUT /:id (update camera assignment)

/api/shifts (existing - 4 endpoints)

/api/cycle-templates (existing - 5+ endpoints)
├── GET /
├── GET /:id/steps
└── POST /:id/steps

/api/planning (existing - 3 endpoints)

/api/alerts (existing - 2 endpoints)

/api/workers (existing - 2 endpoints)

/api/activity (existing - 1 endpoint)

/api/summary (existing - 1 endpoint)

/api/health (status check)
```

## Component Hierarchy: Frontend

```
RootLayout
└── Sidebar
    ├── Navigation Links
    │   ├── Dashboard
    │   ├── Live Operators
    │   ├── Stations
    │   ├── Cameras (NEW)
    │   ├── Planning
    │   ├── Alerts
    │   ├── History
    │   └── Summary
    └── User Info

app/cameras/page.tsx (NEW)
├── PageHeader
├── Tabs
│   ├── List View
│   │   └── Camera Cards
│   │       ├── Name
│   │       ├── Location
│   │       ├── Mode Badge (mjpeg|hls|webrtc)
│   │       ├── Status
│   │       └── Actions (Edit, Delete)
│   └── Create Form
│       ├── Name input
│       ├── Location input
│       ├── Stream URL input
│       ├── Mode selector
│       └── Notes textarea

app/stations/page.tsx (ENHANCED)
├── Station Cards
│   ├── Name
│   ├── Type
│   ├── Robot status
│   ├── Camera Badge (NEW) 👈
│   └── Actions

app/stations/[id]/page.tsx (ENHANCED)
├── PageHeader
├── Station Info
├── Live Stream Viewer (NEW) 👈
│   ├── Video/Image Container
│   ├── Mode-specific player
│   ├── Full-screen button
│   └── Error handling
├── Cycle Information
└── Other Details

LiveStreamViewer Component (NEW)
├── MJPEG Mode
│   └── <img src={streamUrl} />
├── HLS Mode
│   └── <video><source src=".m3u8" /></video>
├── WebRTC Mode
│   └── WebRTC connection handler
├── Loading State
├── Error State
└── Full-screen Toggle
```

## Database Schema Relationships

```
┌─────────────┐
│  cameras    │
├─────────────┤
│ id (PK)     │
│ name (UQ)   │
│ location    │
│ stream_url  │
│ mode        │
│ notes       │
│ created_at  │
└──────┬──────┘
       │ 1
       │ to Many
       │
       ├─────────────────────┐
       │                     │
┌──────▼───────────┐   ┌────▼─────────────┐
│  stations        │   │  station_cameras │ (FK)
├──────────────────┤   └──────────────────┘
│ id (PK)          │
│ name (UQ)        │
│ station_type     │
│ has_robot        │
│ is_active        │
│ notes            │
│ cycle_template_id│ ──→ cycle_templates
│ camera_id (FK)   │ ──→ cameras
│ camera_mode      │
│ camera_stream_url│
│ expected_operator│
└──────────────────┘
```

## Error Handling Flow

```
Frontend User Action
    ↓
API Call to Backend
    ↓
Backend Receives Request
    ↓
┌─────────────────────┐
│  Input Validation   │ ← Check types, required fields
└──────┬──────────────┘
       │ Invalid
       ├─→ 400 Bad Request
       │   └─ { error: "descriptive message" }
       │
       │ Valid
       ├─→ Database Operation
           ├─→ ┌──────────────────────┐
           │   │ Database Constraint  │ ← Unique violation, FK error
           │   │ Error                │
           │   └──────┬───────────────┘
           │          │ (code 23505 = unique)
           │          ├─→ 400 Bad Request
           │          │   └─ { error: "descriptive message" }
           │          │
           │          │ Other DB error
           │          └─→ Logged to console with full details
           │             500 Server Error
           │             └─ { error: "Failed to ..." }
           │
           └─→ Success
               ├─ 200 OK (GET, PUT, DELETE)
               └─ 201 Created (POST)
                  └─ Return created/updated data
```

## Streaming Mode Selection

```
User Selects Camera Mode
    ↓
┌─────────────────┬──────────────────┬──────────────┐
│                 │                  │              │
MJPEG            HLS              WebRTC
│                 │                  │
HTTP Stream      HTTP Live         Peer-to-Peer
Motion JPEG      Streaming         Real-Time
                                   Comm
│                 │                  │
└──────┬──────────┴──────────────────┘
       │
Display in Frontend
       │
┌──────▼──────────────────────┐
│ LiveStreamViewer Component   │
├──────────────────────────────┤
│                              │
│ ┌────────────────────────┐   │
│ │ Detect Mode from props │   │
│ └──────┬─────────────────┘   │
│        │                     │
│ ┌──────▼─────────────────┐   │
│ │ Switch Statement       │   │
│ ├──────────────────────────┐ │
│ │ case 'mjpeg':           │ │
│ │   return <img src={url}/> │
│ │ case 'hls':             │ │
│ │   return <video>...</.video> │
│ │ case 'webrtc':          │ │
│ │   return <WebRTCComponent/> │
│ └────────────────────────┘ │
│                            │
└────────────────────────────┘
```

## Environment Configuration

```
Environment Setup
    ↓
├─ Development
│  ├─ DB_HOST=localhost
│  ├─ DB_PORT=5432
│  ├─ DB_USER=postgres
│  ├─ PORT=3001
│  └─ FRONTEND_ORIGIN=http://localhost:3000
│
├─ Staging
│  ├─ DB_HOST=staging-db.internal
│  ├─ DB_PORT=5432
│  ├─ DB_USER=app_user
│  ├─ PORT=3001
│  └─ FRONTEND_ORIGIN=https://staging.factory-manager.app
│
└─ Production
   ├─ DB_HOST=prod-db.rds.amazonaws.com
   ├─ DB_PORT=5432
   ├─ DB_USER=app_user (encrypted)
   ├─ PORT=3001 (or load balancer)
   └─ FRONTEND_ORIGIN=https://factory-manager.company.com
```

## Deployment Pipeline

```
Code Changes
    ↓
┌──────────────────┐
│ Run Tests        │
├──────────────────┤
│ - API tests      │
│ - Component tests│
│ - Integration    │
└────────┬─────────┘
         │ Pass
         ↓
┌──────────────────┐
│ Database         │
│ Migration        │
├──────────────────┤
│ Run migration    │
│ scripts in order │
└────────┬─────────┘
         │
         ↓
┌──────────────────┐
│ Deploy Backend   │
├──────────────────┤
│ Update ENV vars  │
│ Start server     │
└────────┬─────────┘
         │
         ↓
┌──────────────────┐
│ Deploy Frontend  │
├──────────────────┤
│ Build Next.js    │
│ Deploy to CDN    │
└────────┬─────────┘
         │
         ↓
┌──────────────────┐
│ Smoke Tests      │
├──────────────────┤
│ Test key flows   │
│ Monitor logs     │
└──────────────────┘
```

## Monitoring & Logging

```
┌─────────────────────────────────────┐
│      Backend Server Logs            │
├─────────────────────────────────────┤
│                                     │
│ [Database] Connected: 2024-01-27... │
│ [Server] Running on port 3001       │
│ [Server] CORS enabled for: ...      │
│                                     │
│ User Actions (Info Level):          │
│ GET /api/cameras                    │
│ POST /api/stations                  │
│ PUT /api/cameras/1                  │
│                                     │
│ Errors (Error Level):               │
│ Error fetching cameras {            │
│   message: "...",                   │
│   code: "23505",                    │
│   detail: "Key (name)=(...)"        │
│ }                                   │
│                                     │
│ Database Errors:                    │
│ [Database] Failed: duplicate key    │
│ [Database] Connection lost, retry   │
│                                     │
└─────────────────────────────────────┘
```

This architecture ensures:
- ✅ Scalability
- ✅ Maintainability
- ✅ Error handling
- ✅ Production readiness
- ✅ Clear separation of concerns
- ✅ Easy monitoring and debugging
