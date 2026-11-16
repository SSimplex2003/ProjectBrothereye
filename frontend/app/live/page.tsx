"use client"

import { useEffect, useState, useMemo } from "react"
import useSWR from "swr"
import { useRouter } from "next/navigation"
import { Search, RefreshCw, AlertTriangle } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fetchCurrentWorkers, type WorkerCurrentState } from "@/lib/api"
import { getElapsedTime, isStale, formatDateTime } from "@/lib/utils"

export default function LiveOperatorsPage() {
  const router = useRouter()
  const {
    data: workers,
    error,
    isLoading,
    mutate,
  } = useSWR("workers-current", fetchCurrentWorkers, { refreshInterval: 3000 })

  const [search, setSearch] = useState("")
  const [activityFilter, setActivityFilter] = useState<string>("all")
  const [, setTick] = useState(0)

  // Force re-render every second to update elapsed time
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const activities = useMemo(() => {
    if (!workers) return []
    const unique = [...new Set(workers.map((w) => w.current_activity))]
    return unique.sort()
  }, [workers])

  const filteredWorkers = useMemo(() => {
    if (!workers) return []
    return workers.filter((worker) => {
      const matchesSearch = worker.worker_name.toLowerCase().includes(search.toLowerCase())
      const matchesActivity = activityFilter === "all" || worker.current_activity === activityFilter
      return matchesSearch && matchesActivity
    })
  }, [workers, search, activityFilter])

  const handleWorkerClick = (workerName: string) => {
    router.push(`/operator/${encodeURIComponent(workerName)}`)
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Live Operators" description="Real-time monitoring of operator activity status">
        <Button variant="outline" size="sm" onClick={() => mutate()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </PageHeader>

      <div className="p-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search operators..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-card border-border"
            />
          </div>
          <Select value={activityFilter} onValueChange={setActivityFilter}>
            <SelectTrigger className="w-48 bg-card border-border">
              <SelectValue placeholder="Filter by activity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Activities</SelectItem>
              {activities.map((activity) => (
                <SelectItem key={activity} value={activity}>
                  {activity}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            Failed to load operators. Make sure the backend API is running.
          </div>
        )}

        {!isLoading && !error && filteredWorkers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p>No operators found</p>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredWorkers.map((worker) => (
            <WorkerCard
              key={worker.worker_name}
              worker={worker}
              onClick={() => handleWorkerClick(worker.worker_name)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function WorkerCard({ worker, onClick }: { worker: WorkerCurrentState; onClick: () => void }) {
  const stale = isStale(worker.last_event_time)

  return (
    <div
      onClick={onClick}
      className="rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/50 cursor-pointer hover:bg-card/80"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-foreground">{worker.worker_name}</h3>
          <StatusBadge status={worker.current_activity} className="mt-2" />
        </div>
        {stale && (
          <div className="flex items-center gap-1 text-status-break">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs">Stale</span>
          </div>
        )}
      </div>
      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Active for</span>
          <span className="font-mono text-foreground">{getElapsedTime(worker.session_start_time)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Last event</span>
          <span className="text-foreground">{formatDateTime(worker.last_event_time)}</span>
        </div>
      </div>
    </div>
  )
}
