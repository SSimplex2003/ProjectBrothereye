"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { Plus, RefreshCw, Pencil, Trash2, Factory, Bot, CheckCircle2, XCircle, ChevronRight } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { fetchStations, createStation, updateStation, deleteStation, fetchCycleTemplates, type Station, type CycleTemplate } from "@/lib/api"
import { fetchStreamCameras, getStreamUrl, type StreamCamera } from "@/lib/stream-server"
import { LiveStreamViewer } from "@/components/live-stream-viewer"

const STATION_TYPES = ["Assembly", "Soldering", "Milling", "Packaging", "Inspection", "Other"]

export default function StationsPage() {
  const { data: stations, error, isLoading, mutate } = useSWR("stations", fetchStations)
  const { data: templates } = useSWR("cycle-templates", () => fetchCycleTemplates())
  const { data: aiCameras } = useSWR("ai-cameras", fetchStreamCameras, { 
    refreshInterval: 10000,
    onError: () => {} // Silently fail if stream server is down
  })
  
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingStation, setEditingStation] = useState<Station | null>(null)
  const [deletingStation, setDeletingStation] = useState<Station | null>(null)
  const [formError, setFormError] = useState("")

  const handleCreate = async (formData: FormData) => {
    try {
      setFormError("")
      const aiCameraId = formData.get("ai_camera_id") as string
      const selectedAiCamera = aiCameras?.find(c => c.id === aiCameraId)
      
      await createStation({
        name: formData.get("name") as string,
        station_type: formData.get("station_type") as string,
        has_robot: formData.get("has_robot") === "on",
        is_active: formData.get("is_active") === "on",
        notes: (formData.get("notes") as string) || null,
        cycle_template_id: formData.get("cycle_template_id") && formData.get("cycle_template_id") !== "None" ? parseInt(formData.get("cycle_template_id") as string) : null,
        camera_id: null,
        camera_mode: "mjpeg",
        camera_stream_url: selectedAiCamera ? getStreamUrl(selectedAiCamera.id) : null,
        expected_operator_name: (formData.get("expected_operator_name") as string) || null,
        show_stream: formData.get("show_stream") === "on",
      })
      setIsCreateOpen(false)
      mutate()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create station")
    }
  }

  const handleUpdate = async (formData: FormData) => {
    if (!editingStation) return
    try {
      setFormError("")
      const aiCameraId = formData.get("ai_camera_id") as string
      const selectedAiCamera = aiCameras?.find(c => c.id === aiCameraId)
      
      await updateStation(editingStation.id, {
        name: formData.get("name") as string,
        station_type: formData.get("station_type") as string,
        has_robot: formData.get("has_robot") === "on",
        is_active: formData.get("is_active") === "on",
        notes: (formData.get("notes") as string) || null,
        cycle_template_id: formData.get("cycle_template_id") && formData.get("cycle_template_id") !== "None" ? parseInt(formData.get("cycle_template_id") as string) : null,
        camera_id: null,
        camera_mode: "mjpeg",
        camera_stream_url: selectedAiCamera ? getStreamUrl(selectedAiCamera.id) : null,
        expected_operator_name: (formData.get("expected_operator_name") as string) || null,
        show_stream: formData.get("show_stream") === "on",
      })
      setEditingStation(null)
      mutate()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update station")
    }
  }

  const handleDelete = async () => {
    if (!deletingStation) return
    try {
      await deleteStation(deletingStation.id)
      setDeletingStation(null)
      mutate()
    } catch (err) {
      console.error("Failed to delete station:", err)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Stations" description="Manage factory workstations">
        <Button variant="outline" size="sm" onClick={() => mutate()} className="gap-2 bg-transparent">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Add Station
            </Button>
          </DialogTrigger>
          <DialogContent>
            <StationForm 
              title="Add Station"
              description="Create a new factory workstation"
              templates={templates || []}
              aiCameras={aiCameras || []}
              error={formError}
              onSubmit={handleCreate}
              onCancel={() => setIsCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="p-8">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            Failed to load stations. Make sure the backend API is running.
          </div>
        )}

        {!isLoading && !error && stations?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Factory className="h-12 w-12 mb-4" />
            <p>No stations configured yet</p>
            <p className="text-sm">Click "Add Station" to create your first workstation</p>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {stations?.map((station) => (
            <Card key={station.id} className="border-border bg-card">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Factory className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-foreground">{station.name}</CardTitle>
                      <CardDescription>{station.station_type}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => setEditingStation(station)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeletingStation(station)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 mb-3">
                  {station.is_active ? (
                    <Badge variant="secondary" className="gap-1 bg-status-working/20 text-status-working">
                      <CheckCircle2 className="h-3 w-3" />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1 bg-status-offline/20 text-status-offline">
                      <XCircle className="h-3 w-3" />
                      Inactive
                    </Badge>
                  )}
                  {station.has_robot && (
                    <Badge variant="secondary" className="gap-1">
                      <Bot className="h-3 w-3" />
                      Robot
                    </Badge>
                  )}
                </div>
                {station.template_name && (
                  <div className="text-sm text-muted-foreground mb-2">
                    Cycle: {station.template_name} ({station.expected_cycle_seconds}s)
                  </div>
                )}
                {station.camera_stream_url ? (
                  <div className="text-sm text-status-working mb-2 font-medium flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full bg-status-working animate-pulse" />
                    AI Camera Linked {station.show_stream && "(Stream Active)"}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground/70 mb-2">No camera assigned</div>
                )}
                {station.camera_stream_url && station.show_stream && (
                  <div className="mt-3 mb-2 rounded-lg overflow-hidden border border-border">
                    <LiveStreamViewer
                      cameraName={station.name}
                      streamUrl={station.camera_stream_url}
                      mode="mjpeg"
                    />
                  </div>
                )}
                <Link href={`/stations/${station.id}`}>
                  <Button variant="ghost" size="sm" className="mt-3 w-full justify-between bg-transparent">
                    View Details
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingStation} onOpenChange={(open) => !open && setEditingStation(null)}>
        <DialogContent>
          {editingStation && (
            <StationForm 
              title="Edit Station"
              description="Update workstation configuration"
              station={editingStation}
              templates={templates || []}
              aiCameras={aiCameras || []}
              error={formError}
              onSubmit={handleUpdate}
              onCancel={() => setEditingStation(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingStation} onOpenChange={(open) => !open && setDeletingStation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Station</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingStation?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingStation(null)} className="bg-transparent">Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StationForm({
  title,
  description,
  station,
  templates,
  aiCameras,
  error,
  onSubmit,
  onCancel,
}: {
  title: string
  description: string
  station?: Station
  templates: CycleTemplate[]
  aiCameras: StreamCamera[]
  error: string
  onSubmit: (formData: FormData) => void
  onCancel: () => void
}) {
  const [hasRobot, setHasRobot] = useState(station?.has_robot ?? false)
  const [isActive, setIsActive] = useState(station?.is_active ?? true)
  const [showStream, setShowStream] = useState(station?.show_stream ?? false)
  
  // Find the currently linked AI camera by matching stream URL
  const currentAiCameraId = station?.camera_stream_url 
    ? aiCameras.find(c => station.camera_stream_url?.includes(c.id))?.id || ""
    : ""
  const [selectedAiCameraId, setSelectedAiCameraId] = useState<string>(currentAiCameraId)

  return (
    <form action={onSubmit}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        {error && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={station?.name} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="station_type">Station Type</Label>
          <Select name="station_type" defaultValue={station?.station_type || "Assembly"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATION_TYPES.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cycle_template_id">Cycle Template</Label>
          <Select name="cycle_template_id" defaultValue={station?.cycle_template_id?.toString() || "None"}>
            <SelectTrigger>
              <SelectValue placeholder="Select template (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="None">None</SelectItem>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id.toString()}>
                  {template.template_name} ({template.station_type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="has_robot">Has Robot</Label>
          <Switch 
            id="has_robot" 
            name="has_robot" 
            checked={hasRobot}
            onCheckedChange={setHasRobot}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="is_active">Active</Label>
          <Switch 
            id="is_active" 
            name="is_active" 
            checked={isActive}
            onCheckedChange={setIsActive}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" defaultValue={station?.notes || ""} rows={3} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="expected_operator_name">Expected Operator (optional)</Label>
          <Input id="expected_operator_name" name="expected_operator_name" defaultValue={station?.expected_operator_name || ""} placeholder="e.g., John, Sarah" />
        </div>
        <div className="border-t border-border pt-4">
          <h4 className="font-medium text-foreground mb-3">AI Camera Link</h4>
          <div className="grid gap-2">
            <Label htmlFor="ai_camera_id">AI Camera</Label>
            <Select name="ai_camera_id" value={selectedAiCameraId} onValueChange={setSelectedAiCameraId}>
              <SelectTrigger>
                <SelectValue placeholder="Select AI camera (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {aiCameras.map((camera) => (
                  <SelectItem key={camera.id} value={camera.id}>
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${camera.connected ? "bg-status-working" : "bg-status-offline"}`} />
                      {camera.label || camera.id}
                      {camera.fps > 0 && <span className="text-muted-foreground text-xs">({camera.fps} FPS)</span>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
{aiCameras.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No AI cameras available. Add cameras in the Cameras page first.
            </p>
          )}
        </div>
        {selectedAiCameraId && selectedAiCameraId !== "none" && (
          <>
            <div className="flex items-center justify-between mt-3">
              <div>
                <Label htmlFor="show_stream">Show Live Stream</Label>
                <p className="text-xs text-muted-foreground">Display camera feed on stations list</p>
              </div>
              <Switch
                id="show_stream"
                name="show_stream"
                checked={showStream}
                onCheckedChange={setShowStream}
              />
            </div>
            <div className="mt-3 p-3 rounded-lg bg-status-working/10 border border-status-working/20">
              <p className="text-sm text-status-working font-medium">Camera will be linked</p>
              <p className="text-xs text-muted-foreground mt-1">
                {showStream 
                  ? "Live feed will be visible on the stations list and detail page."
                  : "Live feed and AI detections will be shown on the station detail page."}
              </p>
            </div>
          </>
        )}
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} className="bg-transparent">Cancel</Button>
        <Button type="submit">{station ? "Save Changes" : "Create Station"}</Button>
      </DialogFooter>
    </form>
  )
}
