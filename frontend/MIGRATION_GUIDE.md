# Migration Guide: Original Backend → Enhanced Backend with Cameras

## Overview

This guide helps you migrate from your original backend to the enhanced version with camera support.

## What You Get

✅ Full camera management system with 3 streaming modes (MJPEG, HLS, WebRTC)
✅ Better error handling and logging
✅ Enhanced CORS configuration for production
✅ Improved database startup diagnostics
✅ Camera assignment to stations
✅ Stream URL override per station
✅ All original functionality preserved

## Pre-Migration Checklist

- [ ] Backup your existing database
- [ ] Have PostgreSQL connection details ready
- [ ] Review current backend code at `/backend/server.js`
- [ ] Have Node.js 16+ installed
- [ ] Stop the current backend server

## Step 1: Update Database Schema

Run the migration scripts in order:

```bash
# Connect to your PostgreSQL database
psql -h localhost -U postgres -d postgres

# Run the schema creation
psql -h localhost -U postgres -d postgres -f scripts/001_create_factory_tables.sql

# Run the seed data (optional, for testing)
psql -h localhost -U postgres -d postgres -f scripts/002_seed_data.sql
```

**What's being added:**
- `cameras` table for storing camera configurations
- New fields in `stations` table: camera_id, camera_mode, camera_stream_url, expected_operator_name
- Foreign key constraints
- Performance indices

**No data loss:** Existing tables are unmodified (except for adding new optional fields).

## Step 2: Verify Database Tables

```bash
psql -h localhost -U postgres -d postgres

# Check cameras table
\d cameras

# Check stations table  
\d stations

# Verify indices
\di
```

Expected cameras table structure:
```
Column      | Type      | Modifiers
-----------|-----------|--------------------
id          | integer   | primary key
name        | text      | unique, not null
location    | text      |
stream_url  | text      | not null
mode        | text      | default 'mjpeg'
notes       | text      |
created_at  | timestamp | default now()
```

Expected new stations fields:
```
camera_id             | integer
camera_mode           | text
camera_stream_url     | text
expected_operator_name | text
```

## Step 3: Update Environment Variables

**Current `.env`:**
```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=mysecretpassword
DB_NAME=postgres
PORT=3001
```

**Add these new variables:**
```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=mysecretpassword
DB_NAME=postgres
PORT=3001
FRONTEND_ORIGIN=http://localhost:3000
```

Update `FRONTEND_ORIGIN` for your environment:
- Local development: `http://localhost:3000`
- Production: `https://yourdomain.com`

## Step 4: Replace Backend Server Code

Your new enhanced backend is already at `/backend/server.js`. 

**Verify it includes:**
- Camera endpoints (GET, POST, PUT, DELETE)
- Enhanced CORS configuration
- Better error logging with `logDbError()` function
- Improved database startup checks
- Enhanced stations endpoints with camera fields

**Differences from original:**
- All utility functions grouped at the top
- Camera endpoints before existing endpoints
- Better organized with section comments
- Improved error handling throughout

## Step 5: Update Dependencies

Check your `package.json` has required packages:

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "pg": "^8.8.0"
  }
}
```

If missing, install:
```bash
npm install express cors pg
```

## Step 6: Test Backend Connectivity

```bash
# Start the enhanced backend
npm start

# In another terminal, test endpoints
curl http://localhost:3001/api/health
```

Expected response:
```json
{"status":"ok","timestamp":"2024-01-27T15:30:00.000Z"}
```

## Step 7: Test Camera Endpoints

Create a test camera:
```bash
curl -X POST http://localhost:3001/api/cameras \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Camera",
    "location": "Building A",
    "stream_url": "http://example.com/stream",
    "mode": "mjpeg"
  }'
```

Expected response:
```json
{
  "id": 1,
  "name": "Test Camera",
  "location": "Building A",
  "stream_url": "http://example.com/stream",
  "mode": "mjpeg",
  "notes": null,
  "created_at": "2024-01-27T15:30:00.000Z"
}
```

List all cameras:
```bash
curl http://localhost:3001/api/cameras
```

## Step 8: Verify Original Endpoints Still Work

Test that all original functionality is preserved:

```bash
# Workers
curl http://localhost:3001/api/workers
curl http://localhost:3001/api/workers/current

# Shifts
curl http://localhost:3001/api/shifts

# Stations (enhanced)
curl http://localhost:3001/api/stations

# Other endpoints
curl http://localhost:3001/api/summary?date=2024-01-27
curl http://localhost:3001/api/alerts
```

All original endpoints should work exactly as before.

## Step 9: Test Station-Camera Assignment

Create a station with camera:
```bash
curl -X POST http://localhost:3001/api/stations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Assembly Station 1",
    "station_type": "Assembly",
    "has_robot": true,
    "is_active": true,
    "camera_id": 1,
    "camera_mode": "mjpeg",
    "expected_operator_name": "John"
  }'
```

Get station (includes camera info):
```bash
curl http://localhost:3001/api/stations
```

Should include: `camera_name`, `camera_stream_url_default`, `expected_operator_name`

Update station camera:
```bash
curl -X PUT http://localhost:3001/api/stations/1 \
  -H "Content-Type: application/json" \
  -d '{"camera_id": 1, "expected_operator_name": "Sarah"}'
```

## Step 10: Update Frontend (If Needed)

The frontend code at `/lib/api.ts` already includes camera fetchers. No changes needed!

If you're using the original frontend that doesn't have camera support:

```typescript
// Add to lib/api.ts
export interface Camera {
  id: number
  name: string
  location: string | null
  stream_url: string
  mode: "mjpeg" | "hls" | "webrtc"
  notes: string | null
  created_at: string
}

export async function fetchCameras(): Promise<Camera[]> {
  const res = await fetch(`${API_BASE}/api/cameras`)
  if (!res.ok) throw new Error("Failed to fetch cameras")
  return res.json()
}

// Similar functions for createCamera, updateCamera, deleteCamera
```

## Step 11: Configure CORS for Production

Before deploying to production, update environment variables:

**Development:**
```env
FRONTEND_ORIGIN=http://localhost:3000
```

**Production:**
```env
FRONTEND_ORIGIN=https://factory-manager.example.com
```

The backend will accept requests from this origin plus localhost.

## Rollback Plan

If you need to rollback:

```bash
# 1. Stop the enhanced backend
# 2. Restore original backend code (keep it in git!)
# 3. Database tables are backward compatible - no rollback needed
# 4. Restart original backend
```

No data loss because new fields are nullable and optional.

## Troubleshooting

### "Camera name already exists"
You're trying to create a camera with a duplicate name. Use a unique name.

### "Failed to create camera" after POST
Check error logs: `npm start` (if not running with logging)
Verify database connection with: `curl http://localhost:3001/api/health`

### CORS errors in frontend
Update `.env` with correct `FRONTEND_ORIGIN`:
```env
FRONTEND_ORIGIN=http://your-frontend-url:port
```

Restart backend: `npm start`

### Stations endpoint returns null for camera fields
This is expected if camera_id is null. These fields are nullable when no camera is assigned.

### Database connection fails
Verify credentials in `.env`:
```bash
psql -h $DB_HOST -U $DB_USER -d $DB_NAME
```

### Port 3001 already in use
Change in `.env`:
```env
PORT=3002
```

Then restart: `npm start`

## Performance Considerations

The enhanced backend includes:
- Database connection pooling (automatic)
- Query optimization with indices
- Efficient NULL handling with COALESCE

Expected performance: Same or better than original.

## Next Steps

1. ✅ Database migrated
2. ✅ Backend running
3. ✅ Endpoints tested
4. 📱 Update frontend to use camera features (see `/CAMERA_INTEGRATION.md`)
5. 🎥 Set up physical cameras with MJPEG/HLS streams
6. 🚀 Deploy to production

## Support

For issues during migration:

1. Check `/BACKEND_SETUP.md` for detailed API documentation
2. Review `/BACKEND_IMPROVEMENTS.md` for what changed
3. Check server logs: `npm start` (shows detailed errors)
4. Verify database: `\d cameras` in psql
5. Test health endpoint: `curl http://localhost:3001/api/health`

## Summary

You now have:
- ✅ Enhanced backend with camera support
- ✅ Better error handling and logging
- ✅ Production-ready CORS configuration
- ✅ All original functionality preserved
- ✅ Forward-compatible database schema
- ✅ Complete API documentation

The migration is complete and ready for production use!
