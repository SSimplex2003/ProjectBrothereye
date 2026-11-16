"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"
import { StreamImage } from "./stream-image"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { getStreamUrl } from "@/lib/stream-server"
import type { StreamCamera } from "@/lib/stream-server"

interface CameraTileProps {
  camera: StreamCamera
  latestActivity?: string
  onClick?: () => void
  onDelete?: () => void
}

function getActivityBadgeColor(activity: string): string {
  switch (activity.toLowerCase()) {
    case "work":
    case "working":
      return "bg-teal-500"
    case "break":
      return "bg-amber-500"
    case "moving":
      return "bg-blue-500"
    default:
      return "bg-gray-500"
  }
}

export function CameraTile({ camera, latestActivity, onClick, onDelete }: CameraTileProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowDeleteConfirm(true)
  }

  const confirmDelete = () => {
    setShowDeleteConfirm(false)
    onDelete?.()
  }

  return (
    <>
      <div
        className="relative aspect-video bg-slate-900 rounded-lg overflow-hidden cursor-pointer group border border-slate-700 hover:border-slate-600 transition-colors"
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Live Stream */}
        <StreamImage
          src={getStreamUrl(camera.id)}
          alt={camera.label || camera.id}
          className="w-full h-full"
        />

        {/* Camera Label Overlay (top-left) */}
        <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-sm rounded text-sm font-medium text-white">
          {camera.label || camera.id}
        </div>

        {/* Connection Status Badge (top-right) */}
        <Badge
          variant="secondary"
          className={`absolute top-2 right-2 ${
            camera.connected
              ? "bg-green-500/20 text-green-400 border-green-500/30"
              : "bg-red-500/20 text-red-400 border-red-500/30"
          }`}
        >
          {camera.connected ? "Live" : "Offline"}
        </Badge>

        {/* FPS Counter (bottom-right) */}
        {camera.connected && camera.fps > 0 && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-xs text-slate-300">
            {camera.fps.toFixed(1)} FPS
          </div>
        )}

        {/* Activity Badge (bottom-left, moves up when delete button shows) */}
        {latestActivity && (
          <div className={`absolute ${isHovered && onDelete ? "bottom-12" : "bottom-2"} left-2 px-2 py-0.5 rounded text-xs text-white font-medium transition-all ${getActivityBadgeColor(latestActivity)}`}>
            {latestActivity}
          </div>
        )}

        {/* Delete Button (on hover) */}
        {isHovered && onDelete && (
          <Button
            variant="destructive"
            size="icon"
            className="absolute bottom-2 left-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}

        {/* Error Indicator */}
        {camera.error && (
          <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-red-500/80 text-white text-xs truncate">
            {camera.error}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Camera</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{camera.label || camera.id}"? The camera will stop streaming immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
