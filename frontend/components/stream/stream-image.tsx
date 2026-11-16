"use client"

import { useState, useCallback } from "react"
import { VideoOff } from "lucide-react"
import { cn } from "@/lib/utils"

interface StreamImageProps {
  src: string
  alt: string
  className?: string
  onError?: () => void
  onLoad?: () => void
}

export function StreamImage({ src, alt, className, onError, onLoad }: StreamImageProps) {
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const handleError = useCallback(() => {
    setHasError(true)
    setIsLoading(false)
    onError?.()
  }, [onError])

  const handleLoad = useCallback(() => {
    setHasError(false)
    setIsLoading(false)
    onLoad?.()
  }, [onLoad])

  if (hasError) {
    return (
      <div className={cn(
        "flex flex-col items-center justify-center bg-slate-900 text-slate-500",
        className
      )}>
        <VideoOff className="h-12 w-12 mb-2" />
        <span className="text-sm">Stream Offline</span>
      </div>
    )
  }

  return (
    <div className={cn("relative bg-slate-900", className)}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-primary" />
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={handleError}
        onLoad={handleLoad}
        className={cn(
          "w-full h-full object-cover",
          isLoading && "opacity-0"
        )}
      />
    </div>
  )
}
