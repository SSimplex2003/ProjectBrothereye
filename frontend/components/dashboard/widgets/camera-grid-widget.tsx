"use client"

import { useState } from "react"
import useSWR from "swr"
import { Camera, Settings2, X, Check } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { LiveStreamViewer } from "@/components/live-stream-viewer"
import { fetchCameras, type Camera as CameraType } from "@/lib/api"

interface CameraGridWidgetProps {
  config?: {
    cameraIds?: number[]
    columns?: number
  }
  onConfigChange?: (config: Record<string, unknown>) => void
  isEditMode?: boolean
}

export function CameraGridWidget({ config, onConfigChange, isEditMode }: CameraGridWidgetProps) {
  const cameraIds = config?.cameraIds || []
  const columns = config?.columns || 2
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>(cameraIds)
  const [selectedColumns, setSelectedColumns] = useState(columns)

  const { data: cameras } = useSWR("cameras", fetchCameras)

  const selectedCameras = cameras?.filter(c => cameraIds.includes(c.id)) || []

  const handleSaveConfig = () => {
    onConfigChange?.({
      cameraIds: selectedIds,
      columns: selectedColumns,
    })
    setIsConfigOpen(false)
  }

  const toggleCamera = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  if (selectedCameras.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              <CardTitle className="text-foreground">Camera Grid</CardTitle>
            </div>
            {isEditMode && (
              <Button variant="ghost" size="sm" onClick={() => setIsConfigOpen(true)}>
                <Settings2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Camera className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">No cameras selected</p>
            {isEditMode && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setIsConfigOpen(true)}>
                Configure Cameras
              </Button>
            )}
          </div>
        </CardContent>
        <ConfigDialog
          open={isConfigOpen}
          onOpenChange={setIsConfigOpen}
          cameras={cameras || []}
          selectedIds={selectedIds}
          selectedColumns={selectedColumns}
          onToggleCamera={toggleCamera}
          onColumnsChange={setSelectedColumns}
          onSave={handleSaveConfig}
        />
      </Card>
    )
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            <CardTitle className="text-foreground">Camera Grid</CardTitle>
          </div>
          {isEditMode && (
            <Button variant="ghost" size="sm" onClick={() => setIsConfigOpen(true)}>
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div 
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {selectedCameras.map((camera) => (
            <div key={camera.id} className="rounded-lg border border-border overflow-hidden bg-black aspect-video">
              <LiveStreamViewer
                streamUrl={camera.stream_url}
                mode={camera.mode}
                cameraName={camera.name}
              />
            </div>
          ))}
        </div>
      </CardContent>
      <ConfigDialog
        open={isConfigOpen}
        onOpenChange={setIsConfigOpen}
        cameras={cameras || []}
        selectedIds={selectedIds}
        selectedColumns={selectedColumns}
        onToggleCamera={toggleCamera}
        onColumnsChange={setSelectedColumns}
        onSave={handleSaveConfig}
      />
    </Card>
  )
}

function ConfigDialog({
  open,
  onOpenChange,
  cameras,
  selectedIds,
  selectedColumns,
  onToggleCamera,
  onColumnsChange,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  cameras: CameraType[]
  selectedIds: number[]
  selectedColumns: number
  onToggleCamera: (id: number) => void
  onColumnsChange: (columns: number) => void
  onSave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Configure Camera Grid</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">Columns</label>
            <Select value={String(selectedColumns)} onValueChange={(v) => onColumnsChange(Number(v))}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Column</SelectItem>
                <SelectItem value="2">2 Columns</SelectItem>
                <SelectItem value="3">3 Columns</SelectItem>
                <SelectItem value="4">4 Columns</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Select Cameras</label>
            <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
              {cameras.length === 0 ? (
                <p className="text-sm text-muted-foreground">No cameras available</p>
              ) : (
                cameras.map((camera) => (
                  <label
                    key={camera.id}
                    className="flex items-center gap-3 p-2 rounded-lg border border-border hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedIds.includes(camera.id)}
                      onCheckedChange={() => onToggleCamera(camera.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{camera.name}</p>
                      {camera.location && (
                        <p className="text-xs text-muted-foreground truncate">{camera.location}</p>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
