"use client"

import { useState, useMemo, useEffect } from "react"
import useSWR from "swr"
import { PieChart as PieChartIcon, Settings2 } from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { fetchCurrentWorkers, fetchActivity, fetchWorkers } from "@/lib/api"

// Activity colors for pie chart
const ACTIVITY_COLORS: Record<string, string> = {
  working: "#22c55e",
  active: "#22c55e",
  break: "#f59e0b",
  pause: "#f59e0b",
  idle: "#6b7280",
  away: "#3b82f6",
  offline: "#ef4444",
  meeting: "#8b5cf6",
  lunch: "#f97316",
  moving: "#8b5cf6",
  researching: "#a855f7",
  other: "#ec4899",
  default: "#a855f7",
}

const REMAINING_COLOR = "#1f2937"

function getActivityColor(activity: string): string {
  const normalized = activity.toLowerCase()
  for (const [key, color] of Object.entries(ACTIVITY_COLORS)) {
    if (normalized.includes(key)) return color
  }
  return ACTIVITY_COLORS.default
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

interface OperatorPieWidgetProps {
  config?: {
    operatorName?: string | null
  }
  onConfigChange?: (config: Record<string, unknown>) => void
  isEditMode?: boolean
}

export function OperatorPieWidget({ config, onConfigChange, isEditMode }: OperatorPieWidgetProps) {
  const operatorName = config?.operatorName || null
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [selectedOperator, setSelectedOperator] = useState<string | null>(operatorName)
  const [, setTick] = useState(0)

  const today = new Date().toISOString().split("T")[0]

  const { data: workers } = useSWR("workers-list", fetchWorkers)
  const { data: currentWorkers } = useSWR("workers-current", fetchCurrentWorkers, { refreshInterval: 3000 })
  const { data: todayActivity } = useSWR(
    operatorName ? `activity-${operatorName}-${today}` : null,
    () => operatorName ? fetchActivity(operatorName, today) : null,
    { refreshInterval: 5000 }
  )

  // Update elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const currentWorker = useMemo(() => {
    return currentWorkers?.find((w) => w.worker_name === operatorName)
  }, [currentWorkers, operatorName])

  const pieChartData = useMemo(() => {
    const activityTotals: Record<string, number> = {}
    const TWO_HOURS_SECONDS = 2 * 60 * 60

    if (todayActivity && todayActivity.length > 0) {
      for (const log of todayActivity) {
        const type = log.activity_type || "Other"
        const activityLower = type.toLowerCase()
        const isNonWorking = activityLower.includes('break') || 
                             activityLower.includes('idle') || 
                             activityLower.includes('away') ||
                             activityLower.includes('offline') ||
                             activityLower.includes('lunch')

        let durationSeconds = 0
        if (log.start_time && log.end_time) {
          const start = new Date(log.start_time).getTime()
          const end = new Date(log.end_time).getTime()
          durationSeconds = Math.max(0, Math.floor((end - start) / 1000))
        } else if (log.duration_minutes) {
          durationSeconds = Number(log.duration_minutes) * 60
        }

        if (isNonWorking && durationSeconds > TWO_HOURS_SECONDS) {
          durationSeconds = TWO_HOURS_SECONDS
        }

        if (durationSeconds > 0) {
          activityTotals[type] = (activityTotals[type] || 0) + durationSeconds
        }
      }
    }

    // Add current ongoing activity
    if (currentWorker && currentWorker.session_start_time) {
      const currentActivity = currentWorker.current_activity || "Working"
      const activityLower = currentActivity.toLowerCase()
      const isNonWorking = activityLower.includes('break') || 
                           activityLower.includes('idle') || 
                           activityLower.includes('away') ||
                           activityLower.includes('offline') ||
                           activityLower.includes('lunch')

      const sessionStart = new Date(currentWorker.session_start_time).getTime()
      let ongoingSeconds = Math.max(0, Math.floor((Date.now() - sessionStart) / 1000))

      if (isNonWorking && ongoingSeconds > TWO_HOURS_SECONDS) {
        ongoingSeconds = TWO_HOURS_SECONDS
      }

      if (ongoingSeconds > 0) {
        activityTotals[currentActivity] = (activityTotals[currentActivity] || 0) + ongoingSeconds
      }
    }

    const FULL_WORKDAY_SECONDS = 8 * 60 * 60
    const totalWorked = Object.values(activityTotals).reduce((sum, val) => sum + (val || 0), 0)

    const chartData = Object.entries(activityTotals)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({
        name,
        value,
        color: getActivityColor(name),
        isRemaining: false,
      }))
      .sort((a, b) => b.value - a.value)

    const remaining = Math.max(0, FULL_WORKDAY_SECONDS - totalWorked)
    if (remaining > 0) {
      chartData.push({
        name: "Remaining",
        value: remaining,
        color: REMAINING_COLOR,
        isRemaining: true,
      })
    }

    return chartData
  }, [todayActivity, currentWorker])

  const handleSaveConfig = () => {
    onConfigChange?.({ operatorName: selectedOperator })
    setIsConfigOpen(false)
  }

  if (!operatorName) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-primary" />
              <CardTitle className="text-foreground">Operator Activity</CardTitle>
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
            <PieChartIcon className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">No operator selected</p>
            {isEditMode && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setIsConfigOpen(true)}>
                Select Operator
              </Button>
            )}
          </div>
        </CardContent>
        <ConfigDialog
          open={isConfigOpen}
          onOpenChange={setIsConfigOpen}
          workers={workers || []}
          selectedOperator={selectedOperator}
          onOperatorChange={setSelectedOperator}
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
            <PieChartIcon className="h-5 w-5 text-primary" />
            <CardTitle className="text-foreground">{operatorName}</CardTitle>
          </div>
          {isEditMode && (
            <Button variant="ghost" size="sm" onClick={() => setIsConfigOpen(true)}>
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieChartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {pieChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload
                    return (
                      <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
                        <p className="text-sm font-medium text-foreground">{data.name}</p>
                        <p className="text-sm text-muted-foreground">{formatDuration(data.value)}</p>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Legend
                formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
      <ConfigDialog
        open={isConfigOpen}
        onOpenChange={setIsConfigOpen}
        workers={workers || []}
        selectedOperator={selectedOperator}
        onOperatorChange={setSelectedOperator}
        onSave={handleSaveConfig}
      />
    </Card>
  )
}

function ConfigDialog({
  open,
  onOpenChange,
  workers,
  selectedOperator,
  onOperatorChange,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workers: string[]
  selectedOperator: string | null
  onOperatorChange: (operator: string | null) => void
  onSave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Select Operator</DialogTitle>
        </DialogHeader>
        <div>
          <Select value={selectedOperator || ""} onValueChange={(v) => onOperatorChange(v || null)}>
            <SelectTrigger>
              <SelectValue placeholder="Select an operator" />
            </SelectTrigger>
            <SelectContent>
              {workers.map((worker) => (
                <SelectItem key={worker} value={worker}>
                  {worker}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
