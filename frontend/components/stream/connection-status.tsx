"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface HealthStatus {
  status: string
  cameras_total: number
  cameras_connected: number
  db_enabled: boolean
}

interface ConnectionStatusProps {
  className?: string
}

export function ConnectionStatus({ className }: ConnectionStatusProps) {
  const [isOnline, setIsOnline] = useState<boolean | null>(null)
  const [dbEnabled, setDbEnabled] = useState<boolean | null>(null)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch("/api/stream/health", { 
          method: "GET",
          signal: AbortSignal.timeout(5000)
        })
        if (res.ok) {
          const data: HealthStatus = await res.json()
          setIsOnline(true)
          setDbEnabled(data.db_enabled ?? false)
        } else {
          setIsOnline(false)
          setDbEnabled(false)
        }
      } catch {
        setIsOnline(false)
        setDbEnabled(false)
      } finally {
        setIsChecking(false)
      }
    }

    // Initial check
    checkStatus()

    // Poll every 10 seconds
    const interval = setInterval(checkStatus, 10000)

    return () => clearInterval(interval)
  }, [])

  if (isChecking && isOnline === null) {
    return (
      <div className={cn("flex items-center gap-4 text-sm text-slate-400", className)}>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-slate-500 animate-pulse" />
          <span>Checking...</span>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex items-center gap-4 text-sm", className)}>
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "h-2 w-2 rounded-full",
            isOnline ? "bg-green-500" : "bg-red-500"
          )}
        />
        <span className={isOnline ? "text-green-400" : "text-red-400"}>
          {isOnline ? "Server online" : "Server offline"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "h-2 w-2 rounded-full",
            dbEnabled ? "bg-green-500" : "bg-red-500"
          )}
        />
        <span className={dbEnabled ? "text-green-400" : "text-red-400"}>
          DB
        </span>
      </div>
    </div>
  )
}
