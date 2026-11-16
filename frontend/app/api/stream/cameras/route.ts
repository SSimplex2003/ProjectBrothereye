import { NextResponse } from "next/server"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001"
const STREAM_SERVER = process.env.NEXT_PUBLIC_STREAM_SERVER || "http://localhost:5000"

// Camera from PostgreSQL database
interface DbCamera {
  id: number
  name: string
  location: string | null
  stream_url: string
  mode: string
  notes: string | null
  created_at: string
}

// Camera for frontend (matches StreamCamera interface)
interface StreamCamera {
  id: string
  label: string
  source: string | number
  connected: boolean
  fps: number
  error: string | null
  started_at: string | null
  zone?: [number, number, number, number]
  db_id?: number // Reference to database ID
}

// Convert DB camera to StreamCamera format
function dbCameraToStreamCamera(dbCamera: DbCamera, flaskStatus?: { connected: boolean; fps: number; error: string | null; started_at: string | null }): StreamCamera {
  return {
    id: dbCamera.name, // Use name as the stream ID
    label: dbCamera.name,
    source: dbCamera.stream_url,
    connected: flaskStatus?.connected ?? false,
    fps: flaskStatus?.fps ?? 0,
    error: flaskStatus?.error ?? null,
    started_at: flaskStatus?.started_at ?? null,
    db_id: dbCamera.id,
  }
}

// Helper to register a camera with Flask streaming server
async function registerWithFlask(dbCamera: DbCamera): Promise<{ connected: boolean; fps: number; error: string | null; started_at: string | null } | null> {
  try {
    const flaskRes = await fetch(`${STREAM_SERVER}/api/cameras`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: dbCamera.name,
        source: dbCamera.stream_url,
        label: dbCamera.name,
      }),
      signal: AbortSignal.timeout(5000)
    })
    if (flaskRes.ok) {
      const flaskData = await flaskRes.json()
      return {
        connected: flaskData.camera?.connected ?? false,
        fps: flaskData.camera?.fps ?? 0,
        error: flaskData.camera?.error ?? null,
        started_at: flaskData.camera?.started_at ?? null,
      }
    }
  } catch {
    // Flask registration failed
  }
  return null
}

export async function GET() {
  try {
    // Fetch cameras from PostgreSQL database (persistent storage)
    const dbRes = await fetch(`${API_BASE}/api/cameras`)
    if (!dbRes.ok) {
      throw new Error("Failed to fetch cameras from database")
    }
    const dbCameras: DbCamera[] = await dbRes.json()

    // Try to get streaming status from Flask server
    let flaskCameras: Map<string, { connected: boolean; fps: number; error: string | null; started_at: string | null }> = new Map()
    let flaskAvailable = false
    try {
      const flaskRes = await fetch(`${STREAM_SERVER}/api/cameras`, {
        signal: AbortSignal.timeout(3000)
      })
      if (flaskRes.ok) {
        flaskAvailable = true
        const flaskData = await flaskRes.json()
        for (const cam of (flaskData.cameras || [])) {
          flaskCameras.set(cam.id, {
            connected: cam.connected,
            fps: cam.fps,
            error: cam.error,
            started_at: cam.started_at,
          })
        }
      }
    } catch {
      // Flask server not available, cameras will show as disconnected
      console.log("[v0] Flask server not available, cameras will show as disconnected")
    }

    // Merge database cameras with Flask status, auto-register missing ones
    const cameras: StreamCamera[] = []
    for (const dbCam of dbCameras) {
      let flaskStatus = flaskCameras.get(dbCam.name)
      
      // If Flask is available but camera is not registered, register it now
      if (flaskAvailable && !flaskStatus) {
        console.log(`[v0] Auto-registering camera "${dbCam.name}" with Flask server`)
        flaskStatus = await registerWithFlask(dbCam)
      }
      
      cameras.push(dbCameraToStreamCamera(dbCam, flaskStatus ?? undefined))
    }

    return NextResponse.json({ cameras })
  } catch (error) {
    console.error("Failed to fetch cameras:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch cameras" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // Validate required fields
    if (!body.id || body.source === undefined) {
      return NextResponse.json(
        { error: "id and source are required" },
        { status: 400 }
      )
    }

    // Save to PostgreSQL database (persistent storage)
    const dbRes = await fetch(`${API_BASE}/api/cameras`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: body.id,
        stream_url: String(body.source),
        location: body.label || null,
        mode: "mjpeg",
        notes: null,
      }),
    })

    if (!dbRes.ok) {
      const error = await dbRes.json()
      if (error.error?.includes("duplicate") || error.error?.includes("already exists")) {
        return NextResponse.json(
          { error: "Camera ID already exists" },
          { status: 409 }
        )
      }
      throw new Error(error.error || "Failed to save camera to database")
    }

    const dbCamera: DbCamera = await dbRes.json()

    // Also register with Flask streaming server (for live streaming)
    let flaskStatus: { connected: boolean; fps: number; error: string | null; started_at: string | null } | undefined
    try {
      const flaskRes = await fetch(`${STREAM_SERVER}/api/cameras`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: body.id,
          source: body.source,
          label: body.label || body.id,
          zone: body.zone,
        }),
        signal: AbortSignal.timeout(5000)
      })
      if (flaskRes.ok) {
        const flaskData = await flaskRes.json()
        flaskStatus = {
          connected: flaskData.camera?.connected ?? false,
          fps: flaskData.camera?.fps ?? 0,
          error: flaskData.camera?.error ?? null,
          started_at: flaskData.camera?.started_at ?? null,
        }
      }
    } catch {
      // Flask server not available, camera saved but not streaming
      console.log("[v0] Flask server not available, camera saved to DB but not streaming")
    }

    const camera = dbCameraToStreamCamera(dbCamera, flaskStatus)
    return NextResponse.json({ camera }, { status: 201 })
  } catch (error) {
    console.error("Failed to create camera:", error)
    const message = error instanceof Error ? error.message : "Failed to create camera"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
