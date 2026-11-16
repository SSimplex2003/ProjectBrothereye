"use client"

import { useState, useEffect } from "react"
import { Info, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import type { StreamCamera } from "@/lib/stream-server"

type SourceType = "usb" | "rtsp" | "mjpeg" | "custom"

interface EditCameraDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  camera: StreamCamera | null
  onSubmit: (cameraId: string, updates: { source?: string | number; label?: string }) => Promise<void>
}

const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: "usb", label: "USB Webcam" },
  { value: "rtsp", label: "RTSP Camera" },
  { value: "mjpeg", label: "HTTP MJPEG" },
  { value: "custom", label: "Custom" },
]

function detectSourceType(source: string | number): SourceType {
  if (typeof source === "number") return "usb"
  if (source.startsWith("rtsp://")) return "rtsp"
  if (source.startsWith("http://") || source.startsWith("https://")) return "mjpeg"
  return "custom"
}

export function EditCameraDrawer({ open, onOpenChange, camera, onSubmit }: EditCameraDrawerProps) {
  const [sourceType, setSourceType] = useState<SourceType>("custom")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  // Initialize form values when camera changes
  useEffect(() => {
    if (camera) {
      setSourceType(detectSourceType(camera.source))
      setError("")
    }
  }, [camera])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!camera) return

    setError("")
    setIsSubmitting(true)

    const form = e.currentTarget
    const formData = new FormData(form)

    const label = (formData.get("label") as string).trim() || undefined

    // Build source based on type
    let source: string | number
    if (sourceType === "usb") {
      source = parseInt(formData.get("device_index") as string) || 0
    } else if (sourceType === "rtsp") {
      source = (formData.get("rtsp_url") as string).trim()
    } else if (sourceType === "mjpeg") {
      source = (formData.get("mjpeg_url") as string).trim()
    } else {
      source = (formData.get("custom_source") as string).trim()
    }

    // Validate
    if (typeof source === "string" && !source) {
      setError("Source URL is required")
      setIsSubmitting(false)
      return
    }

    try {
      await onSubmit(camera.id, { source, label })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update camera")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!camera) return null

  const currentSource = String(camera.source)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Camera</SheetTitle>
          <SheetDescription>
            Update the camera source URL or display label
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          {/* Error Display */}
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Camera ID (read-only) */}
          <div className="space-y-2">
            <Label htmlFor="id">Camera ID</Label>
            <Input
              id="id"
              value={camera.id}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              Camera ID cannot be changed
            </p>
          </div>

          {/* Display Label */}
          <div className="space-y-2">
            <Label htmlFor="label">Display Label</Label>
            <Input
              id="label"
              name="label"
              defaultValue={camera.label || ""}
              placeholder="Front entrance"
            />
          </div>

          {/* Source Type Selector */}
          <div className="space-y-2">
            <Label>Source Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {SOURCE_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setSourceType(type.value)}
                  className={cn(
                    "px-3 py-2 text-sm rounded-lg border transition-colors",
                    sourceType === type.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent border-border hover:bg-muted"
                  )}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Source Input (changes based on type) */}
          {sourceType === "usb" && (
            <div className="space-y-2">
              <Label htmlFor="device_index">Device Index</Label>
              <Input
                id="device_index"
                name="device_index"
                type="number"
                min="0"
                defaultValue={typeof camera.source === "number" ? camera.source : 0}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                0 for first camera, 1 for second, etc.
              </p>
            </div>
          )}

          {sourceType === "rtsp" && (
            <div className="space-y-2">
              <Label htmlFor="rtsp_url">RTSP URL</Label>
              <Input
                id="rtsp_url"
                name="rtsp_url"
                type="url"
                defaultValue={currentSource.startsWith("rtsp://") ? currentSource : ""}
                placeholder="rtsp://admin:password@192.168.1.10:554/stream"
                required
              />
              <p className="text-xs text-muted-foreground">
                Works with Hikvision, Dahua, Axis, Reolink, and most IP cameras
              </p>
            </div>
          )}

          {sourceType === "mjpeg" && (
            <div className="space-y-2">
              <Label htmlFor="mjpeg_url">HTTP MJPEG URL</Label>
              <Input
                id="mjpeg_url"
                name="mjpeg_url"
                type="url"
                defaultValue={currentSource.startsWith("http") ? currentSource : ""}
                placeholder="http://192.168.1.10/video.mjpg"
                required
              />
            </div>
          )}

          {sourceType === "custom" && (
            <div className="space-y-2">
              <Label htmlFor="custom_source">Source</Label>
              <Input
                id="custom_source"
                name="custom_source"
                defaultValue={currentSource}
                placeholder="/dev/video0"
                required
              />
              <p className="text-xs text-muted-foreground">
                For Linux v4l2 devices or other custom sources
              </p>
            </div>
          )}

          {/* Current Source Display */}
          <div className="rounded-lg bg-muted/50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <Info className="h-4 w-4" />
              Current Source
            </div>
            <code className="text-xs text-muted-foreground break-all">
              {currentSource}
            </code>
          </div>

          {/* Submit */}
          <div className="flex gap-2">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1 bg-transparent"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
