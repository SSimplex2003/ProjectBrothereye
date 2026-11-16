// Types and API helpers for the Flask AI streaming server
// Base URL for the streaming server (Flask AI server)
const STREAM_SERVER = process.env.NEXT_PUBLIC_STREAM_SERVER || "http://localhost:5000"

// =====================
// TYPES
// =====================

export interface StreamCamera {
  id: string
  label: string
  source: string | number
  connected: boolean
  fps: number
  error: string | null
  started_at: string | null
  zone?: [number, number, number, number] // [x, y, width, height]
}

export interface StreamCameraCreate {
  id: string
  source: string | number
  label?: string
  zone?: [number, number, number, number]
}

export interface CameraEvent {
  camera_id: string
  worker_name: string | null
  activity_type: string
  confidence: number
  event_time: string
  start_time?: string
  end_time?: string
  duration_minutes?: number
  is_log?: boolean
}

// =====================
// URL HELPERS (client-side)
// =====================

export function getStreamUrl(cameraId: string): string {
  return `${STREAM_SERVER}/stream/${encodeURIComponent(cameraId)}`
}

export function getSnapshotUrl(cameraId: string): string {
  return `${STREAM_SERVER}/snapshot/${encodeURIComponent(cameraId)}`
}

export function getStreamServerUrl(): string {
  return STREAM_SERVER
}

// =====================
// API HELPERS (for route handlers)
// =====================

export async function fetchStreamCameras(): Promise<StreamCamera[]> {
  const res = await fetch(`${STREAM_SERVER}/api/cameras`)
  if (!res.ok) throw new Error("Failed to fetch cameras from stream server")
  const data = await res.json()
  return data.cameras || []
}

export async function fetchStreamCamera(id: string): Promise<StreamCamera> {
  const res = await fetch(`${STREAM_SERVER}/api/cameras/${encodeURIComponent(id)}`)
  if (!res.ok) {
    if (res.status === 404) throw new Error("Camera not found")
    throw new Error("Failed to fetch camera from stream server")
  }
  const data = await res.json()
  return data.camera
}

export async function createStreamCamera(camera: StreamCameraCreate): Promise<StreamCamera> {
  const res = await fetch(`${STREAM_SERVER}/api/cameras`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(camera),
  })
  if (!res.ok) {
    if (res.status === 409) throw new Error("Camera ID already exists")
    if (res.status === 400) {
      const error = await res.json()
      throw new Error(error.error || "Invalid camera data")
    }
    throw new Error("Failed to create camera on stream server")
  }
  const data = await res.json()
  return data.camera
}

export async function deleteStreamCamera(id: string): Promise<void> {
  const res = await fetch(`${STREAM_SERVER}/api/cameras/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
  if (!res.ok) {
    if (res.status === 404) throw new Error("Camera not found")
    throw new Error("Failed to delete camera from stream server")
  }
}

export async function fetchStreamEvents(cameraId?: string): Promise<CameraEvent[]> {
  const url = cameraId 
    ? `${STREAM_SERVER}/api/events/${encodeURIComponent(cameraId)}`
    : `${STREAM_SERVER}/api/events`
  const res = await fetch(url)
  if (!res.ok) throw new Error("Failed to fetch events from stream server")
  const data = await res.json()
  return data.events || []
}

// =====================
// SERVER STATUS CHECK
// =====================

export async function checkStreamServerStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${STREAM_SERVER}/api/cameras`, { 
      method: "GET",
      signal: AbortSignal.timeout(5000)
    })
    return res.ok
  } catch {
    return false
  }
}
