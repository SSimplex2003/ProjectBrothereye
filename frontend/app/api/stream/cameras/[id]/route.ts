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
  db_id?: number
}

// Convert DB camera to StreamCamera format
function dbCameraToStreamCamera(dbCamera: DbCamera, flaskStatus?: { connected: boolean; fps: number; error: string | null; started_at: string | null }): StreamCamera {
  return {
    id: dbCamera.name,
    label: dbCamera.name,
    source: dbCamera.stream_url,
    connected: flaskStatus?.connected ?? false,
    fps: flaskStatus?.fps ?? 0,
    error: flaskStatus?.error ?? null,
    started_at: flaskStatus?.started_at ?? null,
    db_id: dbCamera.id,
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const decodedId = decodeURIComponent(id)

    // Fetch all cameras from database and find by name
    const dbRes = await fetch(`${API_BASE}/api/cameras`)
    if (!dbRes.ok) {
      throw new Error("Failed to fetch cameras from database")
    }
    const dbCameras: DbCamera[] = await dbRes.json()
    const dbCamera = dbCameras.find(c => c.name === decodedId)

    if (!dbCamera) {
      return NextResponse.json({ error: "Camera not found" }, { status: 404 })
    }

    // Try to get streaming status from Flask server
    let flaskStatus: { connected: boolean; fps: number; error: string | null; started_at: string | null } | undefined
    try {
      const flaskRes = await fetch(`${STREAM_SERVER}/api/cameras/${encodeURIComponent(decodedId)}`, {
        signal: AbortSignal.timeout(3000)
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
      // Flask server not available
    }

    const camera = dbCameraToStreamCamera(dbCamera, flaskStatus)
    return NextResponse.json({ camera })
  } catch (error) {
    console.error("Failed to fetch camera:", error)
    const message = error instanceof Error ? error.message : "Failed to fetch camera"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const decodedId = decodeURIComponent(id)

    // First find the camera in database by name
    const dbRes = await fetch(`${API_BASE}/api/cameras`)
    if (!dbRes.ok) {
      throw new Error("Failed to fetch cameras from database")
    }
    const dbCameras: DbCamera[] = await dbRes.json()
    const dbCamera = dbCameras.find(c => c.name === decodedId)

    if (!dbCamera) {
      return NextResponse.json({ error: "Camera not found" }, { status: 404 })
    }

    // Delete from PostgreSQL database (persistent storage)
    const deleteRes = await fetch(`${API_BASE}/api/cameras/${dbCamera.id}`, {
      method: "DELETE",
    })

    if (!deleteRes.ok && deleteRes.status !== 404) {
      throw new Error("Failed to delete camera from database")
    }

    // Also try to remove from Flask streaming server
    try {
      await fetch(`${STREAM_SERVER}/api/cameras/${encodeURIComponent(decodedId)}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(3000)
      })
    } catch {
      // Flask server not available, but DB deletion succeeded
      console.log("[v0] Flask server not available, camera deleted from DB only")
    }

    return NextResponse.json({ removed: decodedId })
  } catch (error) {
    console.error("Failed to delete camera:", error)
    const message = error instanceof Error ? error.message : "Failed to delete camera"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const decodedId = decodeURIComponent(id)
    const body = await request.json()

    // First find the camera in database by name
    const dbRes = await fetch(`${API_BASE}/api/cameras`)
    if (!dbRes.ok) {
      throw new Error("Failed to fetch cameras from database")
    }
    const dbCameras: DbCamera[] = await dbRes.json()
    const dbCamera = dbCameras.find(c => c.name === decodedId)

    if (!dbCamera) {
      return NextResponse.json({ error: "Camera not found" }, { status: 404 })
    }

    // Update in PostgreSQL database
    const updateData: Partial<DbCamera> = {}
    if (body.source !== undefined) updateData.stream_url = String(body.source)
    if (body.label !== undefined) updateData.name = body.label
    if (body.location !== undefined) updateData.location = body.location
    if (body.notes !== undefined) updateData.notes = body.notes

    const updateRes = await fetch(`${API_BASE}/api/cameras/${dbCamera.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateData),
    })

    if (!updateRes.ok) {
      const error = await updateRes.json()
      throw new Error(error.error || "Failed to update camera in database")
    }

    const updatedDbCamera: DbCamera = await updateRes.json()

    // Try to update on Flask streaming server (restart with new source)
    try {
      // First delete the old camera
      await fetch(`${STREAM_SERVER}/api/cameras/${encodeURIComponent(decodedId)}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(3000)
      })
      // Then create with new settings
      await fetch(`${STREAM_SERVER}/api/cameras`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: updatedDbCamera.name,
          source: updatedDbCamera.stream_url,
          label: updatedDbCamera.name,
        }),
        signal: AbortSignal.timeout(5000)
      })
    } catch {
      // Flask server not available
      console.log("[v0] Flask server not available, camera updated in DB only")
    }

    // Return updated camera in StreamCamera format
    const camera: StreamCamera = {
      id: updatedDbCamera.name,
      label: updatedDbCamera.name,
      source: updatedDbCamera.stream_url,
      connected: false,
      fps: 0,
      error: null,
      started_at: null,
      db_id: updatedDbCamera.id,
    }

    return NextResponse.json({ camera })
  } catch (error) {
    console.error("Failed to update camera:", error)
    const message = error instanceof Error ? error.message : "Failed to update camera"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
