"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { Plus, RefreshCw, LayoutGrid, List } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { CameraGrid } from "@/components/stream/camera-grid"
import { AddCameraDrawer } from "@/components/stream/add-camera-drawer"
import { ConnectionStatus } from "@/components/stream/connection-status"
import type { StreamCamera, StreamCameraCreate } from "@/lib/stream-server"

async function fetchStreamCameras(): Promise<StreamCamera[]> {
  const res = await fetch("/api/stream/cameras")
  if (!res.ok) throw new Error("Failed to fetch cameras")
  const data = await res.json()
  return data.cameras || []
}

async function createCamera(camera: StreamCameraCreate): Promise<StreamCamera> {
  const res = await fetch("/api/stream/cameras", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(camera),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || "Failed to create camera")
  }
  const data = await res.json()
  return data.camera
}

async function deleteCamera(id: string): Promise<void> {
  const res = await fetch(`/api/stream/cameras/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || "Failed to delete camera")
  }
}

export default function CamerasPage() {
  const router = useRouter()
  const { data: cameras, error, isLoading, mutate } = useSWR(
    "stream-cameras",
    fetchStreamCameras,
    { refreshInterval: 10000 }
  )

  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const handleAddCamera = async (camera: StreamCameraCreate) => {
    await createCamera(camera)
    mutate()
  }

  const handleDeleteCamera = async (id: string) => {
    try {
      await deleteCamera(id)
      mutate()
    } catch (err) {
      console.error("Failed to delete camera:", err)
    }
  }

  const handleCameraClick = (camera: StreamCamera) => {
    router.push(`/cameras/${encodeURIComponent(camera.id)}`)
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader 
        title="AI Camera Streams" 
        description="Live AI-annotated camera feeds from the streaming server"
      >
        <ConnectionStatus className="hidden sm:flex" />
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => mutate()} 
          className="gap-2 bg-transparent"
        >
          <RefreshCw className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
        <Button size="sm" className="gap-2" onClick={() => setIsDrawerOpen(true)}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add Camera</span>
        </Button>
      </PageHeader>

      <div className="p-4 sm:p-6 lg:p-8">
        {/* Mobile Connection Status */}
        <div className="sm:hidden mb-4">
          <ConnectionStatus />
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            <p className="font-medium">Failed to connect to streaming server</p>
            <p className="text-sm mt-1 opacity-80">
              Make sure the Flask AI server is running and NEXT_PUBLIC_STREAM_SERVER is configured correctly.
            </p>
          </div>
        )}

        {/* Camera Grid */}
        {!isLoading && !error && cameras && (
          <CameraGrid
            cameras={cameras}
            onCameraClick={handleCameraClick}
            onCameraDelete={handleDeleteCamera}
            emptyMessage="No cameras added"
          />
        )}
      </div>

      {/* Add Camera Drawer */}
      <AddCameraDrawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onSubmit={handleAddCamera}
      />
    </div>
  )
}
