"use client"

import useSWR from "swr"
import { Video } from "lucide-react"
import { CameraTile } from "./camera-tile"
import type { StreamCamera, CameraEvent } from "@/lib/stream-server"

async function fetchAllEvents(): Promise<CameraEvent[]> {
  const res = await fetch("/api/stream/events")
  if (!res.ok) return []
  const data = await res.json()
  return data.events || []
}

interface CameraGridProps {
  cameras: StreamCamera[]
  onCameraClick?: (camera: StreamCamera) => void
  onCameraDelete?: (cameraId: string) => void
  emptyMessage?: string
}

export function CameraGrid({ 
  cameras, 
  onCameraClick, 
  onCameraDelete,
  emptyMessage = "No cameras added"
}: CameraGridProps) {
  // Fetch all events for activity badges
  const { data: events } = useSWR("stream-all-events", fetchAllEvents, { refreshInterval: 3000 })

  // Create a map of camera_id to latest activity_type
  const latestActivityByCamera = new Map<string, string>()
  if (events) {
    for (const event of events) {
      if (event.camera_id && !latestActivityByCamera.has(event.camera_id)) {
        latestActivityByCamera.set(event.camera_id, event.activity_type)
      }
    }
  }

  if (cameras.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <Video className="h-16 w-16 mb-4 opacity-50" />
        <p className="text-lg font-medium">{emptyMessage}</p>
        <p className="text-sm mt-1">Use the Add Camera panel to get started</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cameras.map((camera) => (
        <CameraTile
          key={camera.id}
          camera={camera}
          latestActivity={latestActivityByCamera.get(camera.id)}
          onClick={() => onCameraClick?.(camera)}
          onDelete={() => onCameraDelete?.(camera.id)}
        />
      ))}
    </div>
  )
}
