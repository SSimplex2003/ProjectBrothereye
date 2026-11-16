# Backend Implementation Examples

This file provides example implementations for the camera API endpoints.

## Node.js/Express Example

### Camera Routes (`/routes/cameras.js`)

```javascript
const express = require('express');
const router = express.Router();
const db = require('../db'); // Your database connection

// GET all cameras
router.get('/cameras', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM cameras ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single camera
router.get('/cameras/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM cameras WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Camera not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create camera
router.post('/cameras', async (req, res) => {
  try {
    const { name, location, stream_url, mode, notes } = req.body;
    
    if (!name || !stream_url) {
      return res.status(400).json({ error: 'Name and stream_url are required' });
    }
    
    const result = await db.query(
      `INSERT INTO cameras (name, location, stream_url, mode, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, location || null, stream_url, mode || 'mjpeg', notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Camera name already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT update camera
router.put('/cameras/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, location, stream_url, mode, notes } = req.body;
    
    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (location !== undefined) {
      updates.push(`location = $${paramCount++}`);
      values.push(location);
    }
    if (stream_url !== undefined) {
      updates.push(`stream_url = $${paramCount++}`);
      values.push(stream_url);
    }
    if (mode !== undefined) {
      updates.push(`mode = $${paramCount++}`);
      values.push(mode);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramCount++}`);
      values.push(notes);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(id);
    const query = `UPDATE cameras SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    
    const result = await db.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Camera not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE camera
router.delete('/cameras/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // First, clear any station references to this camera
    await db.query('UPDATE stations SET camera_id = NULL WHERE camera_id = $1', [id]);
    
    const result = await db.query('DELETE FROM cameras WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Camera not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

### Station Updates (`/routes/stations.js`)

```javascript
// UPDATE station (existing route - add camera field support)
router.put('/stations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      station_type,
      has_robot,
      is_active,
      notes,
      cycle_template_id,
      camera_id,
      camera_mode,
      camera_stream_url,
      expected_operator_name
    } = req.body;
    
    // Verify camera exists if assigning one
    if (camera_id) {
      const cameraCheck = await db.query(
        'SELECT id FROM cameras WHERE id = $1',
        [camera_id]
      );
      if (cameraCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Camera not found' });
      }
    }
    
    const result = await db.query(
      `UPDATE stations SET
        name = COALESCE($2, name),
        station_type = COALESCE($3, station_type),
        has_robot = COALESCE($4, has_robot),
        is_active = COALESCE($5, is_active),
        notes = COALESCE($6, notes),
        cycle_template_id = COALESCE($7, cycle_template_id),
        camera_id = COALESCE($8, camera_id),
        camera_mode = COALESCE($9, camera_mode),
        camera_stream_url = COALESCE($10, camera_stream_url),
        expected_operator_name = COALESCE($11, expected_operator_name)
       WHERE id = $1
       RETURNING *`,
      [
        id,
        name,
        station_type,
        has_robot,
        is_active,
        notes,
        cycle_template_id,
        camera_id,
        camera_mode,
        camera_stream_url,
        expected_operator_name
      ]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Station not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

## Python/FastAPI Example

```python
from fastapi import FastAPI, HTTPException, status
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func
from sqlalchemy.ext.declarative import declarative_base
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

app = FastAPI()
Base = declarative_base()

# Models
class Camera(Base):
    __tablename__ = "cameras"
    
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    location = Column(String, nullable=True)
    stream_url = Column(String, nullable=False)
    mode = Column(String, default="mjpeg", nullable=False)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

# Pydantic schemas
class CameraCreate(BaseModel):
    name: str
    location: Optional[str] = None
    stream_url: str
    mode: str = "mjpeg"
    notes: Optional[str] = None

class CameraUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    stream_url: Optional[str] = None
    mode: Optional[str] = None
    notes: Optional[str] = None

# Routes
@app.get("/api/cameras")
async def list_cameras(db: Session = Depends(get_db)):
    cameras = db.query(Camera).order_by(Camera.name).all()
    return cameras

@app.get("/api/cameras/{camera_id}")
async def get_camera(camera_id: int, db: Session = Depends(get_db)):
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    return camera

@app.post("/api/cameras", status_code=status.HTTP_201_CREATED)
async def create_camera(camera: CameraCreate, db: Session = Depends(get_db)):
    try:
        db_camera = Camera(**camera.dict())
        db.add(db_camera)
        db.commit()
        db.refresh(db_camera)
        return db_camera
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/api/cameras/{camera_id}")
async def update_camera(camera_id: int, camera: CameraUpdate, db: Session = Depends(get_db)):
    db_camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not db_camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    update_data = camera.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_camera, key, value)
    
    db.add(db_camera)
    db.commit()
    db.refresh(db_camera)
    return db_camera

@app.delete("/api/cameras/{camera_id}")
async def delete_camera(camera_id: int, db: Session = Depends(get_db)):
    db_camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not db_camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # Clear station references
    db.execute(f"UPDATE stations SET camera_id = NULL WHERE camera_id = {camera_id}")
    
    db.delete(db_camera)
    db.commit()
    return {"success": True}
```

## Integration Notes

### Error Handling
Ensure your endpoints return appropriate HTTP status codes:
- `200 OK` - Successful GET
- `201 Created` - Successful POST
- `400 Bad Request` - Invalid input
- `404 Not Found` - Resource doesn't exist
- `409 Conflict` - Duplicate unique field (e.g., camera name)
- `500 Internal Server Error` - Server error

### Validation
- Camera name must be unique
- Stream URL must be non-empty
- Mode must be one of: "mjpeg", "hls", "webrtc"
- When deleting camera, update related stations

### Transaction Safety
- Use transactions for operations affecting multiple tables
- When deleting cameras, set camera_id to NULL on related stations
- Handle concurrent requests appropriately

### Performance
- Add indexes on frequently queried fields
- Consider pagination for large camera lists
- Cache camera list if not frequently changing
