// backend/server.js - Enhanced Factory Manager Backend with Camera Support
import express from "express"
import cors from "cors"
import pg from "pg"
import ffmpeg from "fluent-ffmpeg"
import ffmpegStatic from "ffmpeg-static"

const { Pool } = pg

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic)

const app = express()
app.set("trust proxy", 1)

const PORT = Number(process.env.PORT || 3001)

// =====================
// DB
// =====================
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "mysecretpassword",
  database: process.env.DB_NAME || "factory_manager",
})

// =====================
// Middleware
// =====================
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.FRONTEND_ORIGIN,
].filter(Boolean)

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true)
      if (allowedOrigins.includes(origin)) return cb(null, true)
      return cb(new Error(`CORS blocked origin: ${origin}`), false)
    },
    credentials: true,
  }),
)

app.options(/.*/, cors())
app.use(express.json({ limit: "2mb" }))

// =====================
// Utilities
// =====================
function isISODate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function logDbError(prefix, err) {
  console.error(prefix, {
    message: err?.message,
    code: err?.code,
    detail: err?.detail,
    where: err?.where,
  })
}

// DB test on startup
async function testDb() {
  try {
    const r = await pool.query("SELECT NOW() as now")
    console.log("[Database] Connected successfully:", r.rows[0].now)
  } catch (e) {
    logDbError("[Database] CONNECTION FAILED", e)
  }
}
testDb()

// =====================
// RTSP TO MJPEG STREAMING
// =====================

// Store active streaming sessions to manage processes
const streamSessions = new Map()

// GET /api/stream/rtsp - Convert RTSP to MJPEG stream
app.get("/api/stream/rtsp", (req, res) => {
  const { url, cameraId } = req.query

  if (!url) {
    return res.status(400).json({ error: "url parameter is required" })
  }

  // Create unique session ID
  const sessionId = cameraId || `stream-${Date.now()}`

  // Set MJPEG response headers
  res.setHeader("Content-Type", "multipart/x-mixed-replace; boundary=BOUNDARY")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")

  // Check if we already have this stream session
  let proc = streamSessions.get(sessionId)

  if (proc) {
    // Reuse existing FFmpeg process
    proc.pipe(res)
    return
  }

  // Create new FFmpeg process for RTSP to MJPEG conversion
  proc = ffmpeg(decodeURIComponent(url))
    .inputOptions([
      "-rtsp_transport tcp", // Use TCP for better reliability
      "-i", decodeURIComponent(url),
    ])
    .outputOptions([
      "-f", "mjpeg", // Output format: MJPEG
      "-q:v", "5", // Quality (1-31, lower is better)
      "-vf", "scale=1280:720", // Scale to 1280x720
      "-r", "10", // 10 FPS
    ])
    .output("pipe:1")
    .on("start", (cmd) => {
      console.log(`[RTSP Stream] Started for ${sessionId}:`, cmd)
    })
    .on("error", (err) => {
      console.error(`[RTSP Stream] Error for ${sessionId}:`, err.message)
      streamSessions.delete(sessionId)
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to stream camera" })
      }
    })
    .on("end", () => {
      console.log(`[RTSP Stream] Ended for ${sessionId}`)
      streamSessions.delete(sessionId)
    })

  // Store the stream process
  streamSessions.set(sessionId, proc)

  // Pipe to response
  proc.pipe(res)

  // Cleanup on client disconnect
  res.on("close", () => {
    console.log(`[RTSP Stream] Client disconnected for ${sessionId}`)
    if (streamSessions.has(sessionId)) {
      const stream = streamSessions.get(sessionId)
      stream?.kill?.()
      streamSessions.delete(sessionId)
    }
  })
})

// =====================
// CAMERA ENDPOINTS
// =====================

// GET /api/cameras - list all cameras
app.get("/api/cameras", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, location, stream_url, mode, notes, created_at
      FROM cameras
      ORDER BY name
    `)
    res.json(result.rows)
  } catch (error) {
    logDbError("Error fetching cameras", error)
    res.status(500).json({ error: "Failed to fetch cameras" })
  }
})

// GET /api/cameras/:id - get single camera
app.get("/api/cameras/:id", async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query(
      `SELECT id, name, location, stream_url, mode, notes, created_at FROM cameras WHERE id = $1`,
      [id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Camera not found" })
    }
    res.json(result.rows[0])
  } catch (error) {
    logDbError("Error fetching camera", error)
    res.status(500).json({ error: "Failed to fetch camera" })
  }
})

// POST /api/cameras - create new camera
app.post("/api/cameras", async (req, res) => {
  try {
    const { name, location, stream_url, mode, notes } = req.body

    if (!name || !stream_url) {
      return res.status(400).json({ error: "name and stream_url are required" })
    }

    if (!["mjpeg", "hls", "webrtc", "rtsp"].includes(mode || "mjpeg")) {
      return res.status(400).json({ error: "mode must be one of: mjpeg, hls, webrtc, rtsp" })
    }

    const result = await pool.query(
      `INSERT INTO cameras (name, location, stream_url, mode, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, location || null, stream_url, mode || "mjpeg", notes || null],
    )
    res.status(201).json(result.rows[0])
  } catch (error) {
    logDbError("Error creating camera", error)
    if (error.code === "23505") {
      return res.status(400).json({ error: "Camera name already exists" })
    }
    res.status(500).json({ error: "Failed to create camera" })
  }
})

// PUT /api/cameras/:id - update camera
app.put("/api/cameras/:id", async (req, res) => {
  try {
    const { id } = req.params
    const { name, location, stream_url, mode, notes } = req.body

    if (mode && !["mjpeg", "hls", "webrtc", "rtsp"].includes(mode)) {
      return res.status(400).json({ error: "mode must be one of: mjpeg, hls, webrtc, rtsp" })
    }

    const result = await pool.query(
      `UPDATE cameras 
       SET name = COALESCE($1, name),
           location = COALESCE($2, location),
           stream_url = COALESCE($3, stream_url),
           mode = COALESCE($4, mode),
           notes = COALESCE($5, notes)
       WHERE id = $6
       RETURNING *`,
      [name, location, stream_url, mode, notes, id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Camera not found" })
    }
    res.json(result.rows[0])
  } catch (error) {
    logDbError("Error updating camera", error)
    if (error.code === "23505") {
      return res.status(400).json({ error: "Camera name already exists" })
    }
    res.status(500).json({ error: "Failed to update camera" })
  }
})

// DELETE /api/cameras/:id - delete camera
app.delete("/api/cameras/:id", async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query("DELETE FROM cameras WHERE id = $1 RETURNING *", [id])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Camera not found" })
    }
    res.json({ success: true, deleted: result.rows[0] })
  } catch (error) {
    logDbError("Error deleting camera", error)
    res.status(500).json({ error: "Failed to delete camera" })
  }
})

// =====================
// WORKERS ENDPOINTS
// =====================

// GET /api/workers - distinct list of workers
app.get("/api/workers", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT worker_name 
      FROM (
        SELECT worker_name FROM activity_state WHERE worker_name IS NOT NULL
        UNION
        SELECT worker_name FROM activity_logs WHERE worker_name IS NOT NULL
        UNION
        SELECT worker_name FROM station_plan WHERE worker_name IS NOT NULL
      ) AS combined
      WHERE worker_name IS NOT NULL AND worker_name != ''
      ORDER BY worker_name
    `)
    
    // If no workers found from activity, return default operators
    if (result.rows.length === 0) {
      return res.json([
        'John Smith',
        'Maria Garcia', 
        'James Wilson',
        'Sarah Johnson',
        'Michael Brown',
        'Emily Davis',
        'Robert Taylor',
        'Jennifer Martinez'
      ])
    }
    
    res.json(result.rows.map((row) => row.worker_name))
  } catch (error) {
    logDbError("Error fetching workers", error)
    // Return default operators on error
    res.json([
      'John Smith',
      'Maria Garcia', 
      'James Wilson',
      'Sarah Johnson',
      'Michael Brown',
      'Emily Davis',
      'Robert Taylor',
      'Jennifer Martinez'
    ])
  }
})

// GET /api/workers/current - current state of all workers
app.get("/api/workers/current", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        worker_name,
        last_activity AS current_activity,
        last_start_time AS session_start_time,
        last_seen_time AS last_event_time
      FROM activity_state
      ORDER BY worker_name
    `)
    res.json(result.rows)
  } catch (error) {
    // If table doesn't exist or other DB error, return empty array instead of 500
    // This allows UI to show "No operators found" instead of error
    logDbError("Error fetching current workers", error)
    res.json([])
  }
})

// GET /api/activity?worker_name=...&date=YYYY-MM-DD OR start_date=...&end_date=...
app.get("/api/activity", async (req, res) => {
  try {
    const { worker_name, date, start_date, end_date } = req.query

    if (!worker_name) {
      return res.status(400).json({ error: "worker_name is required" })
    }

    // Support either single date or date range
    let startDate, endDate
    if (start_date && end_date) {
      if (!isISODate(start_date) || !isISODate(end_date)) {
        return res.status(400).json({ error: "dates must be YYYY-MM-DD" })
      }
      startDate = start_date
      endDate = end_date
    } else if (date) {
      if (!isISODate(date)) {
        return res.status(400).json({ error: "date must be YYYY-MM-DD" })
      }
      startDate = date
      endDate = date
    } else {
      return res.status(400).json({ error: "date or start_date/end_date required" })
    }

    const result = await pool.query(
      `
      SELECT id, worker_name, activity_type, start_time, end_time,
             COALESCE(duration_minutes * 60.0, 0) AS duration_seconds,
             COALESCE(duration_minutes, 0) AS duration_minutes
      FROM activity_logs
      WHERE worker_name = $1 AND start_time::date >= $2::date AND start_time::date <= $3::date
      ORDER BY start_time DESC
    `,
      [worker_name, startDate, endDate],
    )

    res.json(result.rows)
  } catch (error) {
    logDbError("Error fetching activity", error)
    res.status(500).json({ error: "Failed to fetch activity" })
  }
})

// GET /api/summary?date=YYYY-MM-DD OR start_date=...&end_date=...
app.get("/api/summary", async (req, res) => {
  try {
    const { date, start_date, end_date } = req.query

    // Support either single date or date range
    let startDate, endDate
    if (start_date && end_date) {
      if (!isISODate(start_date) || !isISODate(end_date)) {
        return res.status(400).json({ error: "dates must be YYYY-MM-DD" })
      }
      startDate = start_date
      endDate = end_date
    } else if (date) {
      if (!isISODate(date)) {
        return res.status(400).json({ error: "date must be YYYY-MM-DD" })
      }
      startDate = date
      endDate = date
    } else {
      return res.status(400).json({ error: "date or start_date/end_date required" })
    }

    const result = await pool.query(
      `
      SELECT worker_name, activity_type,
             COALESCE(SUM(duration_minutes * 60.0), 0)::numeric AS total_seconds,
             COALESCE(SUM(duration_minutes), 0)::numeric AS total_minutes
      FROM activity_logs
      WHERE start_time::date >= $1::date AND start_time::date <= $2::date
      GROUP BY worker_name, activity_type
      ORDER BY worker_name, total_minutes DESC
    `,
      [startDate, endDate],
    )

    res.json(result.rows)
  } catch (error) {
    logDbError("Error fetching summary", error)
    res.status(500).json({ error: "Failed to fetch summary" })
  }
})

// =====================
// HEALTH CHECK
// =====================

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() })
})

// =====================
// STATIONS ENDPOINTS (WITH CAMERA SUPPORT)
// =====================

// GET /api/stations - get all stations with camera and template info
app.get("/api/stations", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, ct.template_name, ct.tolerance_percent,
        COALESCE(
          (SELECT SUM(cs.expected_seconds) FROM cycle_steps cs WHERE cs.template_id = s.cycle_template_id),
          0
        ) AS expected_cycle_seconds,
        c.name AS camera_name,
        c.stream_url AS camera_stream_url_default
      FROM stations s
      LEFT JOIN cycle_templates ct ON s.cycle_template_id = ct.id
      LEFT JOIN cameras c ON s.camera_id = c.id
      ORDER BY s.name
    `)
    res.json(result.rows)
  } catch (error) {
    logDbError("Error fetching stations", error)
    res.status(500).json({ error: "Failed to fetch stations" })
  }
})

// POST /api/stations - create station with optional camera
app.post("/api/stations", async (req, res) => {
  try {
    const { name, station_type, has_robot, is_active, notes, cycle_template_id, camera_id, camera_mode, camera_stream_url, expected_operator_name } = req.body

    if (!name || !station_type) {
      return res.status(400).json({ error: "name and station_type are required" })
    }

    const result = await pool.query(
      `INSERT INTO stations (name, station_type, has_robot, is_active, notes, cycle_template_id, camera_id, camera_mode, camera_stream_url, expected_operator_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [name, station_type, has_robot ?? false, is_active ?? true, notes || null, cycle_template_id || null, camera_id || null, camera_mode || "mjpeg", camera_stream_url || null, expected_operator_name || null],
    )
    res.status(201).json(result.rows[0])
  } catch (error) {
    logDbError("Error creating station", error)
    if (error.code === "23505") {
      return res.status(400).json({ error: "Station name already exists" })
    }
    res.status(500).json({ error: "Failed to create station" })
  }
})

// GET /api/stations/:id - get single station with camera and template info
app.get("/api/stations/:id", async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query(`
      SELECT s.*, ct.template_name, ct.tolerance_percent,
        COALESCE(
          (SELECT SUM(cs.expected_seconds) FROM cycle_steps cs WHERE cs.template_id = s.cycle_template_id),
          0
        ) AS expected_cycle_seconds,
        c.name AS camera_name,
        c.stream_url AS camera_stream_url_default
      FROM stations s
      LEFT JOIN cycle_templates ct ON s.cycle_template_id = ct.id
      LEFT JOIN cameras c ON s.camera_id = c.id
      WHERE s.id = $1
    `, [id])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Station not found" })
    }
    res.json(result.rows[0])
  } catch (error) {
    logDbError("Error fetching station", error)
    res.status(500).json({ error: "Failed to fetch station" })
  }
})

// PUT /api/stations/:id - update station with camera support
app.put("/api/stations/:id", async (req, res) => {
  try {
    const { id } = req.params
    const { name, station_type, has_robot, is_active, notes, cycle_template_id, camera_id, camera_mode, camera_stream_url, expected_operator_name } = req.body

    const result = await pool.query(
      `UPDATE stations 
       SET name = COALESCE($1, name),
           station_type = COALESCE($2, station_type),
           has_robot = COALESCE($3, has_robot),
           is_active = COALESCE($4, is_active),
           notes = $5,
           cycle_template_id = $6,
           camera_id = $7,
           camera_mode = COALESCE($8, camera_mode),
           camera_stream_url = $9,
           expected_operator_name = $10
       WHERE id = $11
       RETURNING *`,
      [name, station_type, has_robot, is_active, notes, cycle_template_id, camera_id, camera_mode, camera_stream_url, expected_operator_name, id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Station not found" })
    }
    res.json(result.rows[0])
  } catch (error) {
    logDbError("Error updating station", error)
    if (error.code === "23505") {
      return res.status(400).json({ error: "Station name already exists" })
    }
    res.status(500).json({ error: "Failed to update station" })
  }
})

// DELETE /api/stations/:id
app.delete("/api/stations/:id", async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query("DELETE FROM stations WHERE id = $1 RETURNING *", [id])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Station not found" })
    }
    res.json({ success: true, deleted: result.rows[0] })
  } catch (error) {
    logDbError("Error deleting station", error)
    res.status(500).json({ error: "Failed to delete station" })
  }
})

// =====================
// SHIFTS ENDPOINTS
// =====================

// GET /api/shifts
app.get("/api/shifts", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM shifts ORDER BY start_time`)
    res.json(result.rows)
  } catch (error) {
    logDbError("Error fetching shifts", error)
    res.status(500).json({ error: "Failed to fetch shifts" })
  }
})

// POST /api/shifts
app.post("/api/shifts", async (req, res) => {
  try {
    const { shift_name, start_time, end_time } = req.body

    if (!shift_name || !start_time || !end_time) {
      return res.status(400).json({ error: "shift_name, start_time, and end_time are required" })
    }

    const result = await pool.query(
      `INSERT INTO shifts (shift_name, start_time, end_time)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [shift_name, start_time, end_time],
    )
    res.status(201).json(result.rows[0])
  } catch (error) {
    logDbError("Error creating shift", error)
    res.status(500).json({ error: "Failed to create shift" })
  }
})

// PUT /api/shifts/:id
app.put("/api/shifts/:id", async (req, res) => {
  try {
    const { id } = req.params
    const { shift_name, start_time, end_time } = req.body

    const result = await pool.query(
      `UPDATE shifts 
       SET shift_name = COALESCE($1, shift_name),
           start_time = COALESCE($2, start_time),
           end_time = COALESCE($3, end_time)
       WHERE id = $4
       RETURNING *`,
      [shift_name, start_time, end_time, id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Shift not found" })
    }
    res.json(result.rows[0])
  } catch (error) {
    logDbError("Error updating shift", error)
    res.status(500).json({ error: "Failed to update shift" })
  }
})

// DELETE /api/shifts/:id
app.delete("/api/shifts/:id", async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query("DELETE FROM shifts WHERE id = $1 RETURNING *", [id])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Shift not found" })
    }
    res.json({ success: true, deleted: result.rows[0] })
  } catch (error) {
    logDbError("Error deleting shift", error)
    res.status(500).json({ error: "Failed to delete shift" })
  }
})

// =====================
// PLANNING ENDPOINTS
// =====================

// GET /api/planning?date=YYYY-MM-DD
app.get("/api/planning", async (req, res) => {
  try {
    const { date } = req.query

    if (!date) {
      return res.status(400).json({ error: "date is required" })
    }
    if (!isISODate(date)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD" })
    }

    const result = await pool.query(
      `SELECT sp.*, s.name AS station_name, s.station_type, sh.shift_name, sh.start_time AS shift_start, sh.end_time AS shift_end
       FROM station_plan sp
       JOIN stations s ON sp.station_id = s.id
       JOIN shifts sh ON sp.shift_id = sh.id
       WHERE sp.plan_date = $1
       ORDER BY sh.start_time, s.name`,
      [date],
    )
    res.json(result.rows)
  } catch (error) {
    logDbError("Error fetching planning", error)
    res.status(500).json({ error: "Failed to fetch planning" })
  }
})

// POST /api/planning
app.post("/api/planning", async (req, res) => {
  try {
    const { plan_date, shift_id, station_id, worker_name } = req.body

    if (!plan_date || !shift_id || !station_id) {
      return res.status(400).json({ error: "plan_date, shift_id, and station_id are required" })
    }
    if (!isISODate(plan_date)) {
      return res.status(400).json({ error: "plan_date must be YYYY-MM-DD" })
    }

    // Check for duplicate worker assignment in same shift
    if (worker_name) {
      const duplicateCheck = await pool.query(
        `SELECT 1 FROM station_plan 
         WHERE plan_date = $1 AND shift_id = $2 AND worker_name = $3 AND station_id != $4`,
        [plan_date, shift_id, worker_name, station_id],
      )
      if (duplicateCheck.rows.length > 0) {
        return res.status(400).json({
          error: `Worker ${worker_name} is already assigned to another station in this shift`,
          warning: true,
        })
      }
    }

    const result = await pool.query(
      `INSERT INTO station_plan (plan_date, shift_id, station_id, worker_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (plan_date, shift_id, station_id) 
       DO UPDATE SET worker_name = $4
       RETURNING *`,
      [plan_date, shift_id, station_id, worker_name || null],
    )
    res.status(201).json(result.rows[0])
  } catch (error) {
    logDbError("Error creating/updating planning", error)
    res.status(500).json({ error: "Failed to create/update planning" })
  }
})

// POST /api/planning/bulk-import - import planning with auto-create stations
app.post("/api/planning/bulk-import", async (req, res) => {
  try {
    const { entries } = req.body // Array of { date, operator_name, station_name, shift_number }

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: "entries array is required" })
    }

    const client = await pool.connect()
    try {
      await client.query("BEGIN")

      // Get existing stations
      const stationsResult = await client.query("SELECT id, name FROM stations")
      const stationMap = {}
      stationsResult.rows.forEach(s => {
        stationMap[s.name.toLowerCase()] = s.id
      })

      // Get existing shifts
      const shiftsResult = await client.query("SELECT id, shift_name FROM shifts")
      const shiftMap = {}
      shiftsResult.rows.forEach(s => {
        const shiftNum = s.shift_name.match(/\d+/)?.[0]
        if (shiftNum) {
          shiftMap[parseInt(shiftNum)] = s.id
        }
        // Also map by full name lowercase
        shiftMap[s.shift_name.toLowerCase()] = s.id
      })

      // If no shifts exist, create default shifts
      if (shiftsResult.rows.length === 0) {
        const defaultShifts = [
          { name: 'Morning', start: '06:00:00', end: '14:00:00' },
          { name: 'Evening', start: '14:00:00', end: '22:00:00' },
          { name: 'Night', start: '22:00:00', end: '06:00:00' }
        ]
        for (let i = 0; i < defaultShifts.length; i++) {
          const shift = defaultShifts[i]
          const result = await client.query(
            "INSERT INTO shifts (shift_name, start_time, end_time) VALUES ($1, $2, $3) RETURNING id",
            [shift.name, shift.start, shift.end]
          )
          shiftMap[i + 1] = result.rows[0].id
          shiftMap[shift.name.toLowerCase()] = result.rows[0].id
        }
      }

      let imported = 0
      let stationsCreated = 0
      const errors = []

      for (const entry of entries) {
        const { date, operator_name, station_name, shift_number } = entry

        if (!date || !station_name) {
          errors.push(`Missing date or station_name for entry`)
          continue
        }

        // Auto-create station if it doesn't exist
        let stationId = stationMap[station_name.toLowerCase()]
        if (!stationId) {
          const newStation = await client.query(
            `INSERT INTO stations (name, station_type, has_robot, is_active, notes)
             VALUES ($1, 'Assembly', false, true, 'Auto-created from planning import')
             ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [station_name]
          )
          stationId = newStation.rows[0].id
          stationMap[station_name.toLowerCase()] = stationId
          stationsCreated++
        }

        // Get shift ID (default to shift 1 if not found)
        const shiftId = shiftMap[shift_number] || shiftMap[1] || Object.values(shiftMap)[0]
        if (!shiftId) {
          errors.push(`No shifts available for ${station_name}`)
          continue
        }

        // Insert planning entry
        await client.query(
          `INSERT INTO station_plan (plan_date, shift_id, station_id, worker_name)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (plan_date, shift_id, station_id) 
           DO UPDATE SET worker_name = $4`,
          [date, shiftId, stationId, operator_name || null]
        )
        imported++
      }

      await client.query("COMMIT")

      res.json({ 
        success: true, 
        imported, 
        stations_created: stationsCreated,
        errors: errors.length > 0 ? errors.slice(0, 5) : undefined
      })
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  } catch (error) {
    logDbError("Error bulk importing planning", error)
    res.status(500).json({ error: "Failed to import planning" })
  }
})

// DELETE /api/planning/:id
app.delete("/api/planning/:id", async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query("DELETE FROM station_plan WHERE id = $1 RETURNING *", [id])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Planning entry not found" })
    }
    res.json({ success: true, deleted: result.rows[0] })
  } catch (error) {
    logDbError("Error deleting planning", error)
    res.status(500).json({ error: "Failed to delete planning" })
  }
})

// =====================
// CYCLE TEMPLATES ENDPOINTS
// =====================

// GET /api/cycle-templates?station_type=Assembly
app.get("/api/cycle-templates", async (req, res) => {
  try {
    const { station_type } = req.query

    let query = `
      SELECT ct.*, 
        COALESCE((SELECT SUM(cs.expected_seconds) FROM cycle_steps cs WHERE cs.template_id = ct.id), 0) AS total_expected_seconds
      FROM cycle_templates ct
    `
    const params = []

    if (station_type) {
      query += " WHERE ct.station_type = $1"
      params.push(station_type)
    }
    query += " ORDER BY ct.template_name"

    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (error) {
    logDbError("Error fetching cycle templates", error)
    res.status(500).json({ error: "Failed to fetch cycle templates" })
  }
})

// POST /api/cycle-templates
app.post("/api/cycle-templates", async (req, res) => {
  try {
    const { station_type, template_name, tolerance_percent } = req.body

    if (!station_type || !template_name) {
      return res.status(400).json({ error: "station_type and template_name are required" })
    }

    const result = await pool.query(
      `INSERT INTO cycle_templates (station_type, template_name, tolerance_percent)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [station_type, template_name, tolerance_percent ?? 20],
    )
    res.status(201).json(result.rows[0])
  } catch (error) {
    logDbError("Error creating cycle template", error)
    res.status(500).json({ error: "Failed to create cycle template" })
  }
})

// PUT /api/cycle-templates/:id
app.put("/api/cycle-templates/:id", async (req, res) => {
  try {
    const { id } = req.params
    const { station_type, template_name, tolerance_percent } = req.body

    const result = await pool.query(
      `UPDATE cycle_templates 
       SET station_type = COALESCE($1, station_type),
           template_name = COALESCE($2, template_name),
           tolerance_percent = COALESCE($3, tolerance_percent)
       WHERE id = $4
       RETURNING *`,
      [station_type, template_name, tolerance_percent, id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Cycle template not found" })
    }
    res.json(result.rows[0])
  } catch (error) {
    logDbError("Error updating cycle template", error)
    res.status(500).json({ error: "Failed to update cycle template" })
  }
})

// DELETE /api/cycle-templates/:id
app.delete("/api/cycle-templates/:id", async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query("DELETE FROM cycle_templates WHERE id = $1 RETURNING *", [id])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Cycle template not found" })
    }
    res.json({ success: true, deleted: result.rows[0] })
  } catch (error) {
    logDbError("Error deleting cycle template", error)
    res.status(500).json({ error: "Failed to delete cycle template" })
  }
})

// GET /api/cycle-templates/:id/steps
app.get("/api/cycle-templates/:id/steps", async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query(`SELECT * FROM cycle_steps WHERE template_id = $1 ORDER BY step_order`, [id])
    res.json(result.rows)
  } catch (error) {
    logDbError("Error fetching cycle steps", error)
    res.status(500).json({ error: "Failed to fetch cycle steps" })
  }
})

// POST /api/cycle-templates/:id/steps
app.post("/api/cycle-templates/:id/steps", async (req, res) => {
  try {
    const { id } = req.params
    const { step_name, expected_seconds, step_order } = req.body

    if (!step_name || expected_seconds === undefined || step_order === undefined) {
      return res.status(400).json({ error: "step_name, expected_seconds, and step_order are required" })
    }

    const result = await pool.query(
      `INSERT INTO cycle_steps (template_id, step_name, expected_seconds, step_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, step_name, expected_seconds, step_order],
    )
    res.status(201).json(result.rows[0])
  } catch (error) {
    logDbError("Error creating cycle step", error)
    res.status(500).json({ error: "Failed to create cycle step" })
  }
})

// PUT /api/cycle-steps/:id
app.put("/api/cycle-steps/:id", async (req, res) => {
  try {
    const { id } = req.params
    const { step_name, expected_seconds, step_order } = req.body

    const result = await pool.query(
      `UPDATE cycle_steps 
       SET step_name = COALESCE($1, step_name),
           expected_seconds = COALESCE($2, expected_seconds),
           step_order = COALESCE($3, step_order)
       WHERE id = $4
       RETURNING *`,
      [step_name, expected_seconds, step_order, id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Cycle step not found" })
    }
    res.json(result.rows[0])
  } catch (error) {
    logDbError("Error updating cycle step", error)
    res.status(500).json({ error: "Failed to update cycle step" })
  }
})

// DELETE /api/cycle-steps/:id
app.delete("/api/cycle-steps/:id", async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query("DELETE FROM cycle_steps WHERE id = $1 RETURNING *", [id])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Cycle step not found" })
    }
    res.json({ success: true, deleted: result.rows[0] })
  } catch (error) {
    logDbError("Error deleting cycle step", error)
    res.status(500).json({ error: "Failed to delete cycle step" })
  }
})

// =====================
// ALERTS ENDPOINTS
// =====================

// GET /api/alerts?date=YYYY-MM-DD&status=Open
app.get("/api/alerts", async (req, res) => {
  try {
    const { date, status } = req.query

    let query = `
      SELECT a.*, s.name AS station_name, sh.shift_name
      FROM alerts a
      LEFT JOIN stations s ON a.station_id = s.id
      LEFT JOIN shifts sh ON a.shift_id = sh.id
      WHERE 1=1
    `
    const params = []
    let idx = 1

    if (date) {
      if (!isISODate(date)) return res.status(400).json({ error: "date must be YYYY-MM-DD" })
      query += ` AND a.plan_date = $${idx++}`
      params.push(date)
    }
    if (status) {
      query += ` AND a.status = $${idx++}`
      params.push(status)
    }
    query += " ORDER BY a.created_at DESC"

    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (error) {
    logDbError("Error fetching alerts", error)
    res.status(500).json({ error: "Failed to fetch alerts" })
  }
})

// PUT /api/alerts/:id/status
app.put("/api/alerts/:id/status", async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    if (!status || !["Open", "Acknowledged", "Resolved"].includes(status)) {
      return res.status(400).json({ error: "Valid status required: Open, Acknowledged, or Resolved" })
    }

    const result = await pool.query(`UPDATE alerts SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [
      status,
      id,
    ])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Alert not found" })
    }
    res.json(result.rows[0])
  } catch (error) {
    logDbError("Error updating alert status", error)
    res.status(500).json({ error: "Failed to update alert status" })
  }
})

// POST /api/alerts/recompute - recompute alerts for a given date
app.post("/api/alerts/recompute", async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split("T")[0]
    
    let alertsCreated = 0
    const client = await pool.connect()
    
    try {
      await client.query("BEGIN")
      
      // Get all stations and shifts with their times (calculate expected_cycle_seconds from cycle_steps)
      const stationsResult = await client.query(`
        SELECT s.id, s.name, s.cycle_template_id, ct.tolerance_percent,
          COALESCE(
            (SELECT SUM(cs.expected_seconds) FROM cycle_steps cs WHERE cs.template_id = s.cycle_template_id),
            0
          ) AS expected_cycle_seconds
        FROM stations s
        LEFT JOIN cycle_templates ct ON s.cycle_template_id = ct.id
        WHERE s.is_active = true
      `)
      const shiftsResult = await client.query("SELECT id, shift_name, start_time, end_time FROM shifts")
      
      // Get station plans for the date
      const plansResult = await client.query(
        `SELECT sp.*, s.name as station_name, sh.shift_name, sh.start_time as shift_start, sh.end_time as shift_end
         FROM station_plan sp
         JOIN stations s ON s.id = sp.station_id
         JOIN shifts sh ON sh.id = sp.shift_id
         WHERE sp.plan_date = $1`,
        [date]
      )
      
      // Helper to create alert if not exists
      const createAlertIfNotExists = async (alertData) => {
        const { plan_date, station_id, shift_id, worker_name, alert_type, severity, message } = alertData
        const existing = await client.query(
          `SELECT id FROM alerts 
           WHERE plan_date = $1 
           AND COALESCE(station_id, 0) = COALESCE($2, 0)
           AND COALESCE(shift_id, 0) = COALESCE($3, 0)
           AND COALESCE(worker_name, '') = COALESCE($4, '')
           AND alert_type = $5 AND status != 'Resolved'`,
          [plan_date, station_id || null, shift_id || null, worker_name || null, alert_type]
        )
        
        if (existing.rows.length === 0) {
          await client.query(
            `INSERT INTO alerts (plan_date, station_id, shift_id, worker_name, alert_type, severity, message, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'Open')`,
            [plan_date, station_id || null, shift_id || null, worker_name || null, alert_type, severity, message]
          )
          alertsCreated++
          return true
        }
        return false
      }
      
      // 1. Check for missing operators (stations without assigned workers)
      for (const station of stationsResult.rows) {
        for (const shift of shiftsResult.rows) {
          const plan = plansResult.rows.find(
            p => p.station_id === station.id && p.shift_id === shift.id
          )
          
          if (!plan || !plan.worker_name) {
            await createAlertIfNotExists({
              plan_date: date,
              station_id: station.id,
              shift_id: shift.id,
              alert_type: 'MissingOperator',
              severity: 'Warning',
              message: `No operator assigned to ${station.name} for ${shift.shift_name} shift`
            })
          }
        }
      }
      
      // 2. Check for operator not present at station (assigned but no activity)
      const now = new Date()
      const currentTime = now.toTimeString().slice(0, 8) // HH:MM:SS format
      
      // Get current worker states from activity_state table
      const currentWorkersResult = await client.query(
        `SELECT worker_name, last_activity, last_seen_time FROM activity_state`
      )
      const currentWorkerStates = {}
      for (const w of currentWorkersResult.rows) {
        currentWorkerStates[w.worker_name] = {
          lastActivity: w.last_activity,
          lastSeen: w.last_seen_time
        }
      }
      
      for (const plan of plansResult.rows) {
        // Check if current time is within shift hours
        const isCurrentShift = currentTime >= plan.shift_start && currentTime <= plan.shift_end
        
        if (isCurrentShift && plan.worker_name) {
          // Check activity_state for this worker
          const workerState = currentWorkerStates[plan.worker_name]
          const isStale = !workerState || 
            !workerState.lastSeen || 
            (now - new Date(workerState.lastSeen)) > 5 * 60 * 1000 // 5 minutes stale threshold
          
          // Also check activity_logs as fallback
          const recentActivity = await client.query(
            `SELECT COUNT(*) as count FROM activity_logs 
             WHERE worker_name = $1 
             AND start_time > NOW() - INTERVAL '15 minutes'`,
            [plan.worker_name]
          )
          
          const hasRecentActivity = parseInt(recentActivity.rows[0].count) > 0
          
          if (isStale && !hasRecentActivity) {
            await createAlertIfNotExists({
              plan_date: date,
              station_id: plan.station_id,
              shift_id: plan.shift_id,
              worker_name: plan.worker_name,
              alert_type: 'OperatorNotPresent',
              severity: 'Error',
              message: `${plan.worker_name} is assigned to ${plan.station_name} but is not detected as active`
            })
          }
        }
      }
      
      // 3. Check for operator idle (assigned, present but not working)
      for (const plan of plansResult.rows) {
        const isCurrentShift = currentTime >= plan.shift_start && currentTime <= plan.shift_end
        
        if (isCurrentShift && plan.worker_name) {
          // Check if operator has activity but last activity was "idle" or break > 10 min
          const lastActivity = await client.query(
            `SELECT activity_type, start_time, end_time 
             FROM activity_logs 
             WHERE worker_name = $1
             ORDER BY start_time DESC LIMIT 1`,
            [plan.worker_name]
          )
          
          if (lastActivity.rows.length > 0) {
            const lastAct = lastActivity.rows[0]
            const idleTypes = ['idle', 'break', 'waiting', 'stopped']
            
            if (idleTypes.includes(lastAct.activity_type?.toLowerCase())) {
              const idleMinutes = lastAct.end_time 
                ? (new Date(lastAct.end_time) - new Date(lastAct.start_time)) / 60000
                : (now - new Date(lastAct.start_time)) / 60000
              
              if (idleMinutes > 10) {
                await createAlertIfNotExists({
                  plan_date: date,
                  station_id: plan.station_id,
                  shift_id: plan.shift_id,
                  worker_name: plan.worker_name,
                  alert_type: 'OperatorIdle',
                  severity: 'Warning',
                  message: `${plan.worker_name} at ${plan.station_name} has been idle for ${Math.round(idleMinutes)} minutes`
                })
              }
            }
          }
        }
      }
      
      // 4. Check for overtime alerts
      for (const plan of plansResult.rows) {
        if (plan.worker_name) {
          // Check if operator is working past their shift end time
          const shiftEndToday = new Date(`${date}T${plan.shift_end}`)
          
          if (now > shiftEndToday) {
            // Check if they have activity after shift end
            const overtimeActivity = await client.query(
              `SELECT COUNT(*) as count FROM activity_logs 
               WHERE worker_name = $1
               AND DATE(start_time) = $2
               AND start_time::time > $3`,
              [plan.worker_name, date, plan.shift_end]
            )
            
            if (parseInt(overtimeActivity.rows[0].count) > 0) {
              const overtimeMinutes = Math.round((now - shiftEndToday) / 60000)
              await createAlertIfNotExists({
                plan_date: date,
                station_id: plan.station_id,
                shift_id: plan.shift_id,
                worker_name: plan.worker_name,
                alert_type: 'OvertimeAlert',
                severity: 'Info',
                message: `${plan.worker_name} is working ${overtimeMinutes} minutes overtime at ${plan.station_name}`
              })
            }
          }
        }
      }
      
      // 5. Check for cycle time issues (too slow or record-breaking fast)
      // Based on workers assigned to stations via planning
      for (const plan of plansResult.rows) {
        if (!plan.worker_name) continue
        
        // Find the station and its expected cycle time
        const station = stationsResult.rows.find(s => s.id === plan.station_id)
        if (!station || !station.expected_cycle_seconds) continue
        
        const tolerance = station.tolerance_percent || 20
        const expectedCycle = station.expected_cycle_seconds
        const minAcceptable = expectedCycle * (1 - tolerance / 100)
        const maxAcceptable = expectedCycle * (1 + tolerance / 100)
        
        // Get today's cycle times for this worker (activity_logs doesn't have station_id, so we check by worker)
        const cycleTimes = await client.query(
          `SELECT worker_name, 
                  AVG(EXTRACT(EPOCH FROM (end_time - start_time))) as avg_cycle,
                  MIN(EXTRACT(EPOCH FROM (end_time - start_time))) as min_cycle,
                  COUNT(*) as cycle_count
           FROM activity_logs 
           WHERE worker_name = $1 
           AND DATE(start_time) = $2 
           AND activity_type = 'cycle'
           AND end_time IS NOT NULL
           GROUP BY worker_name`,
          [plan.worker_name, date]
        )
        
        for (const ct of cycleTimes.rows) {
          // Check for slow cycles
          if (ct.avg_cycle > maxAcceptable) {
            await createAlertIfNotExists({
              plan_date: date,
              station_id: station.id,
              worker_name: ct.worker_name,
              alert_type: 'CycleTooSlow',
              severity: 'Warning',
              message: `${ct.worker_name} avg cycle time (${Math.round(ct.avg_cycle)}s) exceeds expected (${expectedCycle}s) at ${station.name}`
            })
          }
          
          // Check for record-breaking fast cycles (potential quality issue or new record)
          if (ct.min_cycle < minAcceptable && ct.cycle_count >= 3) {
            // Check if this is actually a new record for this worker
            const historicalMin = await client.query(
              `SELECT MIN(EXTRACT(EPOCH FROM (end_time - start_time))) as all_time_min
               FROM activity_logs 
               WHERE worker_name = $1 
               AND activity_type = 'cycle'
               AND end_time IS NOT NULL
               AND DATE(start_time) < $2`,
              [ct.worker_name, date]
            )
            
            const allTimeMin = historicalMin.rows[0]?.all_time_min
            
            if (!allTimeMin || ct.min_cycle < allTimeMin) {
              await createAlertIfNotExists({
                plan_date: date,
                station_id: station.id,
                worker_name: ct.worker_name,
                alert_type: 'FastCycleRecord',
                severity: 'Info',
                message: `${ct.worker_name} set new cycle time record (${Math.round(ct.min_cycle)}s) at ${station.name}!`
              })
            }
          }
        }
      }
      
      // 6. Check for stale data (workers with no recent activity)
      const activityResult = await client.query(
        `SELECT DISTINCT worker_name, MAX(start_time) as last_activity
         FROM activity_logs
         WHERE DATE(start_time) = $1
         GROUP BY worker_name
         HAVING MAX(start_time) < NOW() - INTERVAL '30 minutes'`,
        [date]
      )
      
      for (const stale of activityResult.rows) {
        await createAlertIfNotExists({
          plan_date: date,
          worker_name: stale.worker_name,
          alert_type: 'DataStale',
          severity: 'Warning',
          message: `No recent activity data from ${stale.worker_name}`
        })
      }
      
      await client.query("COMMIT")
      res.json({ success: true, alerts_created: alertsCreated })
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  } catch (error) {
    logDbError("Error recomputing alerts", error)
    res.status(500).json({ error: "Failed to recompute alerts" })
  }
})

// POST /api/alerts - create a new alert manually
app.post("/api/alerts", async (req, res) => {
  try {
    const { plan_date, station_id, shift_id, worker_name, alert_type, severity, message } = req.body

    if (!plan_date || !alert_type || !severity || !message) {
      return res.status(400).json({ error: "plan_date, alert_type, severity, and message are required" })
    }
    if (!isISODate(plan_date)) {
      return res.status(400).json({ error: "plan_date must be YYYY-MM-DD" })
    }
    if (!["Info", "Warning", "Error"].includes(severity)) {
      return res.status(400).json({ error: "severity must be Info, Warning, or Error" })
    }

    const result = await pool.query(
      `INSERT INTO alerts (plan_date, station_id, shift_id, worker_name, alert_type, severity, message, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Open')
       RETURNING *`,
      [plan_date, station_id || null, shift_id || null, worker_name || null, alert_type, severity, message]
    )

    // Fetch with station and shift names
    const alert = await pool.query(
      `SELECT a.*, s.name AS station_name, sh.shift_name
       FROM alerts a
       LEFT JOIN stations s ON a.station_id = s.id
       LEFT JOIN shifts sh ON a.shift_id = sh.id
       WHERE a.id = $1`,
      [result.rows[0].id]
    )

    res.status(201).json(alert.rows[0])
  } catch (error) {
    logDbError("Error creating alert", error)
    res.status(500).json({ error: "Failed to create alert" })
  }
})

// =====================
// DASHBOARD WIDGETS ENDPOINTS
// =====================

// Auto-create dashboard_widgets table if not exists
async function ensureDashboardWidgetsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dashboard_widgets (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL DEFAULT 'default',
        page_index INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL DEFAULT 0,
        widget_type VARCHAR(50) NOT NULL,
        config JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `)
    // Check if any default widgets exist for 'default' user
    const check = await pool.query(`SELECT COUNT(*) FROM dashboard_widgets WHERE user_id = 'default'`)
    if (parseInt(check.rows[0].count) === 0) {
      // Insert default widgets
      await pool.query(`
        INSERT INTO dashboard_widgets (user_id, page_index, position, widget_type, config) VALUES
        ('default', 0, 0, 'stats', '{}'),
        ('default', 0, 1, 'quick_links', '{}'),
        ('default', 0, 2, 'live_operators', '{"limit": 6}'),
        ('default', 0, 3, 'alerts_list', '{"limit": 5}')
      `)
      console.log("[Dashboard] Created default widgets")
    }
  } catch (e) {
    logDbError("[Dashboard] Failed to ensure widgets table", e)
  }
}
ensureDashboardWidgetsTable()

// GET /api/dashboard/widgets?user_id=...
app.get("/api/dashboard/widgets", async (req, res) => {
  try {
    const userId = req.query.user_id || "default"
    const result = await pool.query(
      `SELECT * FROM dashboard_widgets WHERE user_id = $1 ORDER BY page_index, position`,
      [userId]
    )
    res.json(result.rows)
  } catch (error) {
    logDbError("Error fetching dashboard widgets", error)
    res.status(500).json({ error: "Failed to fetch dashboard widgets" })
  }
})

// POST /api/dashboard/widgets - create new widget
app.post("/api/dashboard/widgets", async (req, res) => {
  try {
    const { user_id = "default", page_index = 0, position = 0, widget_type, config = {} } = req.body

    if (!widget_type) {
      return res.status(400).json({ error: "widget_type is required" })
    }

    const validTypes = ["stats", "quick_links", "camera_grid", "operator_pie", "alerts_list", "live_operators"]
    if (!validTypes.includes(widget_type)) {
      return res.status(400).json({ error: `widget_type must be one of: ${validTypes.join(", ")}` })
    }

    const result = await pool.query(
      `INSERT INTO dashboard_widgets (user_id, page_index, position, widget_type, config)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user_id, page_index, position, widget_type, JSON.stringify(config)]
    )
    res.status(201).json(result.rows[0])
  } catch (error) {
    logDbError("Error creating dashboard widget", error)
    res.status(500).json({ error: "Failed to create dashboard widget" })
  }
})

// PUT /api/dashboard/widgets/bulk-reorder - reorder multiple widgets at once
// NOTE: This route MUST be defined BEFORE the :id route, otherwise Express matches "bulk-reorder" as an :id
app.put("/api/dashboard/widgets/bulk-reorder", async (req, res) => {
  try {
    const { widgets } = req.body // Array of { id, page_index, position }

    if (!Array.isArray(widgets)) {
      return res.status(400).json({ error: "widgets array is required" })
    }

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      
      for (const w of widgets) {
        await client.query(
          `UPDATE dashboard_widgets SET page_index = $1, position = $2, updated_at = NOW() WHERE id = $3`,
          [w.page_index, w.position, w.id]
        )
      }
      
      await client.query("COMMIT")
      res.json({ success: true, updated: widgets.length })
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  } catch (error) {
    logDbError("Error bulk reordering widgets", error)
    res.status(500).json({ error: "Failed to reorder widgets" })
  }
})

// PUT /api/dashboard/widgets/:id - update widget
app.put("/api/dashboard/widgets/:id", async (req, res) => {
  try {
    const { id } = req.params
    const { page_index, position, widget_type, config } = req.body

    const result = await pool.query(
      `UPDATE dashboard_widgets 
       SET page_index = COALESCE($1, page_index),
           position = COALESCE($2, position),
           widget_type = COALESCE($3, widget_type),
           config = COALESCE($4, config),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [page_index, position, widget_type, config ? JSON.stringify(config) : null, id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Widget not found" })
    }
    res.json(result.rows[0])
  } catch (error) {
    logDbError("Error updating dashboard widget", error)
    res.status(500).json({ error: "Failed to update dashboard widget" })
  }
})

// DELETE /api/dashboard/widgets/:id
app.delete("/api/dashboard/widgets/:id", async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query("DELETE FROM dashboard_widgets WHERE id = $1 RETURNING *", [id])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Widget not found" })
    }
    res.json({ success: true, deleted: result.rows[0] })
  } catch (error) {
    logDbError("Error deleting dashboard widget", error)
    res.status(500).json({ error: "Failed to delete dashboard widget" })
  }
})

// =====================
// Server startup
// =====================
app.listen(PORT, () => {
  console.log(`[Server] Factory Manager Backend running on port ${PORT}`)
  console.log(`[Server] CORS enabled for: ${allowedOrigins.join(", ")}`)
})
