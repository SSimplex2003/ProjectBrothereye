"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { AlertTriangle, Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { fetchCurrentWorkers, type WorkerCurrentState } from "@/lib/api"
import { getElapsedTime, isStale, formatDateTime } from "@/lib/utils"

interface LiveOperatorsWidgetProps {
  config?: {
    limit?: number
  }
}

export function LiveOperatorsWidget({ config }: LiveOperatorsWidgetProps) {
  const limit = config?.limit || 6
  const router = useRouter()
  const { data: workers } = useSWR("workers-current", fetchCurrentWorkers, { refreshInterval: 3000 })
  const [, setTick] = useState(0)

  // Force re-render every second to update elapsed time
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const displayWorkers = workers?.slice(0, limit) || []

  if (!workers || workers.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="text-foreground">Live Operators</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No operators currently tracked</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="text-foreground">Live Operators</CardTitle>
          </div>
          <span className="text-xs text-muted-foreground">{workers.length} total</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {displayWorkers.map((worker) => (
            <OperatorCard
              key={worker.worker_name}
              worker={worker}
              onClick={() => router.push(`/operator/${encodeURIComponent(worker.worker_name)}`)}
            />
          ))}
        </div>
        {workers.length > limit && (
          <button
            onClick={() => router.push("/live")}
            className="w-full mt-3 py-2 text-sm text-primary hover:underline"
          >
            View all {workers.length} operators
          </button>
        )}
      </CardContent>
    </Card>
  )
}

function OperatorCard({ worker, onClick }: { worker: WorkerCurrentState; onClick: () => void }) {
  const stale = isStale(worker.last_event_time)

  return (
    <div
      onClick={onClick}
      className="rounded-lg border border-border bg-card/50 p-3 transition-colors hover:border-primary/50 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="font-medium text-foreground text-sm truncate">{worker.worker_name}</h4>
          <StatusBadge status={worker.current_activity} className="mt-1 text-xs" />
        </div>
        {stale && (
          <div className="flex items-center gap-1 text-status-break shrink-0">
            <AlertTriangle className="h-3 w-3" />
          </div>
        )}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        <span className="font-mono">{getElapsedTime(worker.session_start_time)}</span>
      </div>
    </div>
  )
}
