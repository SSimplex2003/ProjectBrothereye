"use client"

import { useState } from "react"
import { Maximize2, Minimize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001"

interface LiveStreamViewerProps {
  cameraName: string
  streamUrl: string | null
  mode: "mjpeg" | "hls" | "webrtc" | "rtsp"
  isFullscreen?: boolean
  onFullscreenChange?: (isFullscreen: boolean) => void
  cameraId?: number
}

export function LiveStreamViewer({
  cameraName,
  streamUrl,
  mode,
  isFullscreen = false,
  onFullscreenChange,
  cameraId,
}: LiveStreamViewerProps) {
  const [imageError, setImageError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Compute effective URL: use RTSP proxy for RTSP streams, direct for others
  const getEffectiveUrl = () => {
    if (!streamUrl) return null
    if (mode === "rtsp") {
      return `${API_BASE}/api/stream/rtsp?url=${encodeURIComponent(streamUrl)}&cameraId=${cameraId || "default"}`
    }
    return streamUrl
  }

  const effectiveUrl = getEffectiveUrl()

  if (!effectiveUrl) {
    return (
      <div className="flex items-center justify-center bg-muted rounded-lg py-24">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">No camera configured</p>
          <p className="text-sm text-muted-foreground/70">No effective stream URL available</p>
        </div>
      </div>
    )
  }

  const getModeLabel = (streamMode: string) => {
    if (streamMode === "mjpeg") return "MJPEG"
    if (streamMode === "hls") return "HLS"
    if (streamMode === "rtsp") return "RTSP"
    return "WebRTC"
  }

  const content = (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden flex items-center justify-center">
      {(mode === "mjpeg" || mode === "rtsp") && (
        <>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted z-10">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border border-primary/50 border-t-primary mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading stream...</p>
              </div>
            </div>
          )}
          <img
            src={effectiveUrl || "/placeholder.svg"}
            alt={`Live feed: ${cameraName}`}
            crossOrigin="anonymous"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setImageError(true)
              setIsLoading(false)
            }}
            className="w-full h-full object-contain"
          />
          {imageError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
              <div className="text-center px-4">
                <p className="text-red-400 mb-2">Failed to load stream</p>
                <p className="text-xs text-red-300 mb-3">Check camera URL and network connection</p>
                <code className="block text-xs text-muted-foreground bg-muted p-2 rounded mb-2 max-w-xs overflow-auto">
                  {effectiveUrl.substring(0, 80)}...
                </code>
              </div>
            </div>
          )}
        </>
      )}
      {mode === "hls" && (
        <video
          controls
          autoPlay
          muted
          className="w-full h-full object-contain"
          onError={() => setImageError(true)}
        >
          <source src={effectiveUrl} type="application/x-mpegURL" />
          <p className="text-muted-foreground">Your browser does not support HLS video</p>
        </video>
      )}
      {mode === "webrtc" && (
        <div className="flex items-center justify-center w-full h-full">
          <div className="text-center text-muted-foreground">
            <p className="mb-2 font-medium">WebRTC Stream</p>
            <p className="text-sm">WebRTC support coming soon</p>
            <p className="text-xs mt-2 text-muted-foreground/70">{streamUrl}</p>
          </div>
        </div>
      )}
    </div>
  )

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{cameraName}</h2>
            <p className="text-xs text-muted-foreground">{getModeLabel(mode)} Stream</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onFullscreenChange?.(false)}
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-hidden p-4">
          {content}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">{cameraName}</h3>
          <p className="text-xs text-muted-foreground">{getModeLabel(mode)} Stream</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-status-working/20 text-status-working">
            Live
          </Badge>
          {onFullscreenChange && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onFullscreenChange(true)}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="aspect-video w-full">
        {content}
      </div>
    </div>
  )
}
