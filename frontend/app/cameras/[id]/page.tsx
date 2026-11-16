"use client"

import { use } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { ArrowLeft, Copy, Check, RefreshCw, Trash2, Video, Clock, Zap, AlertCircle, Pencil } from "lucide-react"
import { useState } from "react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StreamImage } from "@/components/stream/stream-image"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { getStreamUrl } from "@/lib/stream-server"
import type { StreamCamera, CameraEvent } from "@/lib/stream-server"
import { EditCameraDrawer } from "@/components/stream/edit-camera-drawer"

async function fetchCamera(id: string): Promise<StreamCamera> {
  const res = await fetch(`/api/stream/cameras/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error("Camera not found")
  const data = await res.json()
  return data.camera
}

async function fetchCameraEvents(id: string): Promise<CameraEvent[]> {
  const res = await fetch(`/api/stream/events/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error("Failed to fetch events")
  const data = await res.json()
  return data.events || []
}

async function deleteCamera(id: string): Promise<void> {
  const res = await fetch(`/api/stream/cameras/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error("Failed to delete camera")
}

async function updateCamera(id: string, updates: { source?: string | number; label?: string }): Promise<StreamCamera> {
  const res = await fetch(`/api/stream/cameras/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || "Failed to update camera")
  }
  const data = await res.json()
  return data.camera
}

export default function CameraDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [completedOnly, setCompletedOnly] = useState(true)
  const [showEditDrawer, setShowEditDrawer] = useState(false)

  const { data: camera, error: cameraError, isLoading: cameraLoading, mutate: mutateCamera } = useSWR(
    `stream-camera-${id}`,
    () => fetchCamera(id),
    { refreshInterval: 5000 }
  )

  const { data: events, error: eventsError, isLoading: eventsLoading } = useSWR(
    `stream-events-${id}`,
    () => fetchCameraEvents(id),
    { refreshInterval: 3000 }
  )

  const filteredEvents = completedOnly 
    ? (events?.filter(e => e.is_log === true) || [])
    : (events || [])

  const streamUrl = getStreamUrl(id)

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(streamUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteCamera(id)
      router.push("/cameras")
    } catch (err) {
      console.error("Failed to delete camera:", err)
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleUpdateCamera = async (cameraId: string, updates: { source?: string | number; label?: string }) => {
    const updatedCamera = await updateCamera(cameraId, updates)
    // If the name/label changed, redirect to the new URL
    if (updates.label && updates.label !== cameraId) {
      router.push(`/cameras/${encodeURIComponent(updates.label)}`)
    } else {
      mutateCamera()
    }
  }

  if (cameraLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (cameraError || !camera) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title="Camera Not Found" description="The requested camera does not exist">
          <Button variant="outline" onClick={() => router.push("/cameras")} className="gap-2 bg-transparent">
            <ArrowLeft className="h-4 w-4" />
            Back to Cameras
          </Button>
        </PageHeader>
        <div className="p-8">
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center text-destructive">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">Camera not found</p>
            <p className="text-sm mt-1 opacity-80">
              The camera "{id}" does not exist or the streaming server is offline.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader 
        title={camera.label || camera.id} 
        description={`Camera ID: ${camera.id}`}
      >
        <Button variant="outline" onClick={() => router.push("/cameras")} className="gap-2 bg-transparent">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>
        <Button variant="outline" onClick={() => mutateCamera()} className="gap-2 bg-transparent">
          <RefreshCw className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2 bg-transparent"
          onClick={() => setShowEditDrawer(true)}
        >
          <Pencil className="h-4 w-4" />
          <span className="hidden sm:inline">Edit</span>
        </Button>
        <Button 
          variant="destructive" 
          size="sm" 
          className="gap-2"
          onClick={() => setShowDeleteConfirm(true)}
        >
          <Trash2 className="h-4 w-4" />
          <span className="hidden sm:inline">Remove</span>
        </Button>
      </PageHeader>

      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Large Stream View */}
        <div className="aspect-video w-full max-w-5xl mx-auto rounded-lg overflow-hidden border border-slate-700 bg-slate-900">
          <StreamImage
            src={streamUrl}
            alt={camera.label || camera.id}
            className="w-full h-full"
          />
        </div>

        {/* Two Column Layout */}
        <div className="grid gap-6 lg:grid-cols-2 max-w-5xl mx-auto">
          {/* Camera Metadata */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5" />
                Camera Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge
                  variant="secondary"
                  className={
                    camera.connected
                      ? "bg-green-500/20 text-green-400"
                      : "bg-red-500/20 text-red-400"
                  }
                >
                  {camera.connected ? "Connected" : "Offline"}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Camera ID</span>
                <code className="text-sm font-mono">{camera.id}</code>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Source</span>
                <code className="text-sm font-mono truncate max-w-[200px]" title={String(camera.source)}>
                  {typeof camera.source === "number" ? `USB ${camera.source}` : camera.source}
                </code>
              </div>

              {camera.fps > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Frame Rate</span>
                  <span className="flex items-center gap-1 text-sm">
                    <Zap className="h-3 w-3" />
                    {camera.fps.toFixed(1)} FPS
                  </span>
                </div>
              )}

              {camera.started_at && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Started</span>
                  <span className="flex items-center gap-1 text-sm">
                    <Clock className="h-3 w-3" />
                    {new Date(camera.started_at).toLocaleString()}
                  </span>
                </div>
              )}

              {camera.error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                  {camera.error}
                </div>
              )}

              {/* Stream URL */}
              <div className="pt-2 border-t border-border">
                <span className="text-sm text-muted-foreground block mb-2">Stream URL</span>
                <div className="flex gap-2">
                  <code className="flex-1 text-xs font-mono bg-muted/50 p-2 rounded truncate">
                    {streamUrl}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyUrl}
                    className="bg-transparent shrink-0"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Live Events Feed */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  {completedOnly ? "Completed Segments" : "Live Events"}
                </span>
                <Badge variant="secondary" className="font-normal">
                  {filteredEvents.length} events
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-3 pt-2">
                <Switch
                  id="completed-only-camera"
                  checked={completedOnly}
                  onCheckedChange={setCompletedOnly}
                />
                <Label htmlFor="completed-only-camera" className="cursor-pointer text-sm text-muted-foreground">
                  Completed segments only
                </Label>
              </div>
            </CardHeader>
            <CardContent>
              {eventsLoading && (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {eventsError && (
                <div className="text-center py-8 text-muted-foreground">
                  Failed to load events
                </div>
              )}

              {!eventsLoading && !eventsError && filteredEvents.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  {completedOnly ? "No completed segments yet" : "No events detected yet"}
                </div>
              )}

              {!eventsLoading && !eventsError && filteredEvents.length > 0 && (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {filteredEvents.slice(0, 50).map((event, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg text-sm ${
                        event.is_log
                          ? "bg-teal-500/10 border-l-2 border-teal-500"
                          : "bg-muted/30 text-muted-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={event.is_log ? "font-medium" : "font-normal"}>
                            {event.activity_type}
                          </span>
                          {event.is_log && event.duration_minutes && (
                            <Badge variant="secondary" className="bg-teal-500/20 text-teal-400 text-xs">
                              {event.duration_minutes.toFixed(1)} min
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(event.event_time).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {event.worker_name && (
                          <span>Worker: {event.worker_name}</span>
                        )}
                        <span>Confidence: {(event.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Camera</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{camera.label || camera.id}"? The camera will stop streaming immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Camera Drawer */}
      <EditCameraDrawer
        open={showEditDrawer}
        onOpenChange={setShowEditDrawer}
        camera={camera}
        onSubmit={handleUpdateCamera}
      />
    </div>
  )
}
