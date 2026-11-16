# Backend Setup & API Documentation

## Overview

The enhanced backend (`/backend/server.js`) is a Node.js Express server built with PostgreSQL that manages factory operations including stations, workers, shifts, cycle templates, and cameras. It's been improved with better error handling, CORS configuration, and comprehensive camera streaming support.

## Key Improvements from Original

### 1. Enhanced Utilities
- **Better error logging** with structured error details (message, code, detail, where)
- **Improved database startup checks** with clear console logging
- **ISO date validation** for all date-based queries

### 2. CORS Configuration
- Whitelist-based origin validation instead of hardcoded localhost
- Support for `FRONTEND_ORIGIN` environment variable for production deployments
- Proper OPTIONS preflight handling

### 3. Camera Support (NEW)
- Complete CRUD endpoints for camera management
- Three streaming modes: MJPEG, HLS, WebRTC
- Camera assignment to stations with override URLs
- Stream mode validation and error handling

### 4. Enhanced Stations
- Stations now include camera assignment, expected operator names, and stream configuration
- Automatic camera metadata joins in queries
- Support for per-station camera URL overrides

## Database Requirements

Ensure these tables exist in your PostgreSQL database:

```sql
-- Cameras table
CREATE TABLE cameras (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  location TEXT,
  stream_url TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'mjpeg',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stations table (with camera fields)
CREATE TABLE stations (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  station_type TEXT NOT NULL,
  has_robot BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  cycle_template_id INT,
  camera_id INT,
  camera_mode TEXT DEFAULT 'mjpeg',
  camera_stream_url TEXT,
  expected_operator_name TEXT
);
```

See `/scripts/001_create_factory_tables.sql` for complete schema.

## Environment Variables

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=mysecretpassword
DB_NAME=postgres

# Server
PORT=3001

# CORS
FRONTEND_ORIGIN=http://localhost:3000
```

## API Endpoints

### Cameras

#### GET /api/cameras
List all cameras
```bash
curl http://localhost:3001/api/cameras
```

#### GET /api/cameras/:id
Get single camera
```bash
curl http://localhost:3001/api/cameras/1
```

#### POST /api/cameras
Create new camera
```bash
curl -X POST http://localhost:3001/api/cameras \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Assembly Line 1",
    "location": "Building A",
    "stream_url": "http://192.168.1.100:8080/stream",
    "mode": "mjpeg",
    "notes": "Primary assembly station"
  }'
```

#### PUT /api/cameras/:id
Update camera
```bash
curl -X PUT http://localhost:3001/api/cameras/1 \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "hls",
    "stream_url": "http://192.168.1.100:8080/stream.m3u8"
  }'
```

#### DELETE /api/cameras/:id
Delete camera
```bash
curl -X DELETE http://localhost:3001/api/cameras/1
```

### Stations (Enhanced)

#### GET /api/stations
Get all stations with camera and template info

Response includes:
- All station fields
- Attached camera details (name, stream_url_default)
- Cycle template details (template_name, tolerance_percent)
- Calculated expected_cycle_seconds

#### POST /api/stations
Create station with optional camera

```bash
curl -X POST http://localhost:3001/api/stations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Assembly Station 1",
    "station_type": "Assembly",
    "has_robot": true,
    "is_active": true,
    "cycle_template_id": 1,
    "camera_id": 1,
    "camera_mode": "mjpeg",
    "camera_stream_url": null,
    "expected_operator_name": "John"
  }'
```

#### PUT /api/stations/:id
Update station (all fields optional)

```bash
curl -X PUT http://localhost:3001/api/stations/1 \
  -H "Content-Type: application/json" \
  -d '{
    "camera_id": 2,
    "expected_operator_name": "Sarah"
  }'
```

### Workers

#### GET /api/workers
Get distinct list of all workers

#### GET /api/workers/current
Get current state of all workers

```json
{
  "worker_name": "John",
  "current_activity": "Working",
  "session_start_time": "2024-01-27T08:00:00Z",
  "last_event_time": "2024-01-27T09:30:00Z"
}
```

#### GET /api/activity?worker_name=John&date=2024-01-27
Get activity history for worker on specific date

### Other Endpoints

- **Shifts**: GET, POST, PUT, DELETE /api/shifts
- **Planning**: GET, POST, DELETE /api/planning
- **Cycle Templates**: GET, POST, PUT, DELETE /api/cycle-templates
- **Cycle Steps**: GET, POST, PUT, DELETE /api/cycle-templates/:id/steps
- **Alerts**: GET, PUT /api/alerts (with status updates)
- **Health**: GET /api/health

## Error Handling

All endpoints return structured error responses:

```json
{
  "error": "Station name already exists"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created
- `400`: Bad request (validation error)
- `404`: Not found
- `500`: Server error

Database errors are logged server-side with full details.

## Running the Server

```bash
# Install dependencies
npm install

# Copy environment
cp .env.example .env
# Edit .env with your database credentials

# Start server
npm start

# Or with development watch
npm run dev
```

## Performance Notes

- Database connections are pooled (configured via pg module)
- Indices on frequently queried columns (cameras.mode, stations.camera_id, station_plan.plan_date)
- JOIN queries pre-fetch related data to minimize round trips
- COALESCE used for efficient NULL handling in updates

## Testing

Use curl, Postman, or the SWR frontend to test endpoints:

```bash
# Test database connection
curl http://localhost:3001/api/health

# List cameras
curl http://localhost:3001/api/cameras

# Create test camera
curl -X POST http://localhost:3001/api/cameras \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Camera","stream_url":"http://example.com/stream"}'
```

## Integration with Frontend

The frontend (/lib/api.ts) has matching fetchers for all camera and station endpoints:

```typescript
import { fetchCameras, createCamera, updateCamera, deleteCamera } from "@/lib/api"
import useSWR from "swr"

// In a React component:
const { data: cameras } = useSWR("cameras", fetchCameras)
```

See `/CAMERA_INTEGRATION.md` for complete frontend integration details.
