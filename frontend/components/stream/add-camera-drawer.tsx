"use client"

import { useState } from "react"
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import type { StreamCameraCreate } from "@/lib/stream-server"

type SourceType = "usb" | "rtsp" | "mjpeg" | "custom"

interface AddCameraDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (camera: StreamCameraCreate) => Promise<void>
}

const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: "usb", label: "USB Webcam" },
  { value: "rtsp", label: "RTSP Camera" },
  { value: "mjpeg", label: "HTTP MJPEG" },
  { value: "custom", label: "Custom" },
]

const SOURCE_EXAMPLES = [
  { type: "USB webcam", example: "0 (or 1, 2 for additional cameras)" },
  { type: "RTSP", example: "rtsp://user:pass@192.168.1.10:554/cam/realmonitor?channel=1" },
  { type: "HTTP MJPEG", example: "http://192.168.1.10:8080/video.mjpg" },
  { type: "Linux v4l2", example: "/dev/video0" },
]

export function AddCameraDrawer({ open, onOpenChange, onSubmit }: AddCameraDrawerProps) {
  const [sourceType, setSourceType] = useState<SourceType>("usb")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [showZone, setShowZone] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    setIsSubmitting(true)

    const form = e.currentTarget
    const formData = new FormData(form)

    const id = (formData.get("id") as string).trim().toLowerCase().replace(/\s+/g, "-")
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

    // Build zone if provided
    let zone: [number, number, number, number] | undefined
    if (showZone) {
      const x = parseInt(formData.get("zone_x") as string) || 0
      const y = parseInt(formData.get("zone_y") as string) || 0
      const w = parseInt(formData.get("zone_w") as string) || 0
      const h = parseInt(formData.get("zone_h") as string) || 0
      if (w > 0 && h > 0) {
        zone = [x, y, w, h]
      }
    }

    // Validate
    if (!id) {
      setError("Camera ID is required")
      setIsSubmitting(false)
      return
    }
    if (!/^[a-z0-9-]+$/.test(id)) {
      setError("Camera ID must be lowercase letters, numbers, and hyphens only")
      setIsSubmitting(false)
      return
    }
    if (typeof source === "string" && !source) {
      setError("Source URL is required")
      setIsSubmitting(false)
      return
    }

    try {
      await onSubmit({ id, source, label, zone })
      form.reset()
      setSourceType("usb")
      setShowZone(false)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add camera")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Camera</SheetTitle>
          <SheetDescription>
            Connect a new camera to the AI streaming server
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          {/* Error Display */}
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Camera ID */}
          <div className="space-y-2">
            <Label htmlFor="id">Camera ID</Label>
            <Input
              id="id"
              name="id"
              placeholder="security-cam-1"
              pattern="[a-z0-9-]+"
              required
              className="lowercase"
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, and hyphens only
            </p>
          </div>

          {/* Display Label */}
          <div className="space-y-2">
            <Label htmlFor="label">Display Label</Label>
            <Input
              id="label"
              name="label"
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
                defaultValue="0"
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
                placeholder="/dev/video0"
                required
              />
              <p className="text-xs text-muted-foreground">
                For Linux v4l2 devices or other custom sources
              </p>
            </div>
          )}

          {/* Detection Zone (Collapsible) */}
          <Collapsible open={showZone} onOpenChange={setShowZone}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="outline" className="w-full bg-transparent">
                {showZone ? "Hide" : "Show"} Detection Zone (Optional)
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="zone_x">X Position</Label>
                  <Input
                    id="zone_x"
                    name="zone_x"
                    type="number"
                    min="0"
                    defaultValue="100"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zone_y">Y Position</Label>
                  <Input
                    id="zone_y"
                    name="zone_y"
                    type="number"
                    min="0"
                    defaultValue="100"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zone_w">Width</Label>
                  <Input
                    id="zone_w"
                    name="zone_w"
                    type="number"
                    min="0"
                    defaultValue="400"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zone_h">Height</Label>
                  <Input
                    id="zone_h"
                    name="zone_h"
                    type="number"
                    min="0"
                    defaultValue="400"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Pixel coordinates for the AI detection region
              </p>
            </CollapsibleContent>
          </Collapsible>

          {/* Source Type Reference */}
          <div className="rounded-lg bg-muted/50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium mb-3">
              <Info className="h-4 w-4" />
              Source Format Reference
            </div>
            <div className="space-y-2 text-xs">
              {SOURCE_EXAMPLES.map((item) => (
                <div key={item.type} className="flex gap-2">
                  <span className="text-muted-foreground w-24 shrink-0">{item.type}:</span>
                  <code className="text-foreground break-all">{item.example}</code>
                </div>
              ))}
            </div>
          </div>

          {/* Submit */}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Camera
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
