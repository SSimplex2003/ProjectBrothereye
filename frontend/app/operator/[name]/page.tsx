"use client"

import { useEffect, useState, useMemo, use } from "react"
import useSWR from "swr"
import { useRouter } from "next/navigation"
import { ArrowLeft, RefreshCw, AlertTriangle, User, Clock, Activity, Calendar, Bell, MapPin, Trophy, Timer, Coffee, UserX, TrendingUp } from "lucide-react"
import Link from "next/link"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { fetchCurrentWorkers, fetchActivity, fetchPlanning, fetchShifts, fetchAlerts, fetchStations, updateAlertStatus, type ActivityLog, type StationPlan, type Shift, type Alert } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { getElapsedTime, isStale, formatDateTime, formatTime } from "@/lib/utils"

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

export default function OperatorDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params)
  const workerName = decodeURIComponent(name)
  const router = useRouter()
  const today = new Date().toISOString().split("T")[0]

  const [, setTick] = useState(0)

  // Fetch current worker state
  const {
    data: allWorkers,
    error: workersError,
    mutate: mutateWorkers,
  } = useSWR("workers-current", fetchCurrentWorkers, { refreshInterval: 3000 })

  const {
    data: todayActivity,
    error: activityError,
    mutate: mutateActivity,
  } = useSWR(`activity-${workerName}-${today}`, () => fetchActivity(workerName, today), { refreshInterval: 3000 })

  // Fetch today's planning to get operator schedule
  const { data: planning } = useSWR(`planning-${today}`, () => fetchPlanning(today))
  
  // Fetch shifts
  const { data: shifts } = useSWR("shifts", fetchShifts)
  
  // Fetch stations for linking
  const { data: stations } = useSWR("stations", fetchStations)
  
  // Fetch alerts for this operator
  const { data: allAlerts, mutate: mutateAlerts } = useSWR(
    `alerts-${today}`,
    () => fetchAlerts(today),
    { refreshInterval: 30000 }
  )
  
  // Filter planning entries for this operator
  const operatorSchedule = useMemo(() => {
    if (!planning || !shifts) return []
    return planning
      .filter(p => p.worker_name === workerName)
      .map(p => ({
        ...p,
        shift: shifts.find(s => s.id === p.shift_id),
        station: stations?.find(s => s.id === p.station_id)
      }))
      .sort((a, b) => {
        const startA = a.shift?.start_time || ""
        const startB = b.shift?.start_time || ""
        return startA.localeCompare(startB)
      })
  }, [planning, shifts, stations, workerName])
  
  // Get current shift
  const currentShiftId = useMemo(() => {
    if (!shifts) return null
    const now = new Date()
    const currentTime = now.toTimeString().slice(0, 5)
    
    for (const shift of shifts) {
      const start = shift.start_time.slice(0, 5)
      const end = shift.end_time.slice(0, 5)
      if (currentTime >= start && currentTime <= end) {
        return shift.id
      }
    }
    return null
  }, [shifts])
  
  // Filter alerts for this operator
  const operatorAlerts = useMemo(() => {
    return allAlerts?.filter(a => a.worker_name === workerName && a.status === "Open") || []
  }, [allAlerts, workerName])

  // Force re-render every second for elapsed time
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const worker = useMemo(() => {
    return allWorkers?.find((w) => w.worker_name === workerName)
  }, [allWorkers, workerName])

  const stale = worker ? isStale(worker.last_event_time) : false

  // Check if operator should be considered "out for the day"
  // If they've been on break/idle for more than 2 hours continuously, stop tallying
  const isOperatorOutForDay = useMemo(() => {
    if (!todayActivity || todayActivity.length === 0) return false
    
    // Sort by start_time descending to get most recent first
    const sorted = [...todayActivity].sort(
      (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
    )
    
    // Check the most recent activity
    const latest = sorted[0]
    const activityType = latest.activity_type.toLowerCase()
    const isNonWorking = activityType.includes('break') || 
                         activityType.includes('idle') || 
                         activityType.includes('away') ||
                         activityType.includes('offline') ||
                         activityType.includes('lunch')
    
    if (!isNonWorking) return false
    
    // Calculate how long they've been in this non-working state
    let durationSeconds = 0
    if (latest.start_time && latest.end_time) {
      const start = new Date(latest.start_time).getTime()
      const end = new Date(latest.end_time).getTime()
      durationSeconds = Math.floor((end - start) / 1000)
    } else if (latest.start_time && !latest.end_time) {
      // Ongoing activity
      const start = new Date(latest.start_time).getTime()
      durationSeconds = Math.floor((Date.now() - start) / 1000)
    }
    
    // More than 2 hours = 7200 seconds
    return durationSeconds > 7200
  }, [todayActivity])

  const pieChartData = useMemo(() => {
    const activityTotals: Record<string, number> = {}
    const TWO_HOURS_SECONDS = 2 * 60 * 60

    // Calculate duration from start_time and end_time for each log
    // But cap any single break/idle session at 2 hours
    if (todayActivity && todayActivity.length > 0) {
      for (const log of todayActivity) {
        const type = log.activity_type || "Other"
        const activityLower = type.toLowerCase()
        const isNonWorking = activityLower.includes('break') || 
                             activityLower.includes('idle') || 
                             activityLower.includes('away') ||
                             activityLower.includes('offline') ||
                             activityLower.includes('lunch')

        // Calculate duration from timestamps in SECONDS
        let durationSeconds = 0
        if (log.start_time && log.end_time) {
          const start = new Date(log.start_time).getTime()
          const end = new Date(log.end_time).getTime()
          durationSeconds = Math.max(0, Math.floor((end - start) / 1000))
        } else if (log.duration_minutes) {
          // Fallback to duration_minutes if no end_time
          durationSeconds = Number(log.duration_minutes) * 60
        }

        // Cap non-working activities at 2 hours per session
        if (isNonWorking && durationSeconds > TWO_HOURS_SECONDS) {
          durationSeconds = TWO_HOURS_SECONDS
        }

        if (durationSeconds > 0) {
          activityTotals[type] = (activityTotals[type] || 0) + durationSeconds
        }
      }
    }

    // Add current ongoing activity in SECONDS
    // But only if operator is not considered "out for the day"
    if (worker && worker.session_start_time && !isOperatorOutForDay) {
      const currentActivity = worker.current_activity || "Working"
      const activityLower = currentActivity.toLowerCase()
      const isNonWorking = activityLower.includes('break') || 
                           activityLower.includes('idle') || 
                           activityLower.includes('away') ||
                           activityLower.includes('offline') ||
                           activityLower.includes('lunch')

      const sessionStart = new Date(worker.session_start_time).getTime()
      const now = Date.now()
      let ongoingSeconds = Math.max(0, Math.floor((now - sessionStart) / 1000))

      // Cap non-working activities at 2 hours
      if (isNonWorking && ongoingSeconds > TWO_HOURS_SECONDS) {
        ongoingSeconds = TWO_HOURS_SECONDS
      }

      if (ongoingSeconds > 0) {
        activityTotals[currentActivity] = (activityTotals[currentActivity] || 0) + ongoingSeconds
      }
    }

    // Full workday in SECONDS (8 hours = 28800 seconds)
    const FULL_WORKDAY_SECONDS = 8 * 60 * 60

    // Calculate total worked seconds
    const totalWorked = Object.values(activityTotals).reduce((sum, val) => sum + (val || 0), 0)

    // Build chart data - store seconds but we'll format for display
    const chartData = Object.entries(activityTotals)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({
        name,
        value, // in seconds
        color: getActivityColor(name),
        isRemaining: false,
      }))
      .sort((a, b) => b.value - a.value)

    // Add remaining time
    const remaining = Math.max(0, FULL_WORKDAY_SECONDS - totalWorked)
    if (remaining > 0) {
      chartData.push({
        name: "Remaining",
        value: remaining,
        color: REMAINING_COLOR,
        isRemaining: true,
      })
    }

    // If no data at all, show full gray chart
    if (chartData.length === 0) {
      chartData.push({
        name: "Remaining",
        value: FULL_WORKDAY_SECONDS,
        color: REMAINING_COLOR,
        isRemaining: true,
      })
    }

    return chartData
  }, [todayActivity, worker, isOperatorOutForDay])

  const { totalWorkedSeconds, overtimeSeconds, completionPercent } = useMemo(() => {
    const FULL_WORKDAY_SECONDS = 8 * 60 * 60
    const worked = pieChartData.filter((d) => !d.isRemaining).reduce((sum, item) => sum + (item.value || 0), 0)

    const overtime = Math.max(0, worked - FULL_WORKDAY_SECONDS)
    const completion = FULL_WORKDAY_SECONDS > 0 ? Math.min(100, (worked / FULL_WORKDAY_SECONDS) * 100) : 0

    return {
      totalWorkedSeconds: worked || 0,
      overtimeSeconds: overtime || 0,
      completionPercent: isNaN(completion) ? 0 : completion,
    }
  }, [pieChartData])

  const isLoading = !allWorkers
  const error = workersError || activityError

  const handleRefresh = () => {
    mutateWorkers()
    mutateActivity()
  }

  const formatSeconds = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return "0s"
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    if (hrs > 0) return `${hrs}h ${mins}m`
    if (mins > 0) return `${mins}m ${secs}s`
    return `${secs}s`
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title={workerName} description="Operator activity detail and live feed">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/live")} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2 bg-transparent">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </PageHeader>

      <div className="p-8">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            Failed to load operator data. Make sure the backend API is running.
          </div>
        )}

        {!isLoading && !worker && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <User className="h-12 w-12 mb-4" />
            <p>Operator not found or currently offline</p>
          </div>
        )}

        {worker && (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Live Status Card */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Activity className="h-5 w-5" />
                  Live Status
                </CardTitle>
                <CardDescription>Real-time operator activity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Current Activity</p>
                      <StatusBadge status={worker.current_activity} className="mt-1" />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {isOperatorOutForDay && (
                        <div className="flex items-center gap-1 text-status-offline bg-status-offline/10 px-2 py-1 rounded">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-xs font-medium">Out for Day</span>
                        </div>
                      )}
                      {stale && (
                        <div className="flex items-center gap-1 text-status-break">
                          <AlertTriangle className="h-5 w-5" />
                          <span className="text-sm">Stale Data</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg bg-muted/50 p-4">
                      <p className="text-xs text-muted-foreground">Session Duration</p>
                      <p className="text-2xl font-mono font-bold text-foreground">
                        {getElapsedTime(worker.session_start_time)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-4">
                      <p className="text-xs text-muted-foreground">Last Event</p>
                      <p className="text-sm font-medium text-foreground">{formatDateTime(worker.last_event_time)}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border p-4">
                    <p className="text-xs text-muted-foreground mb-2">Session Started</p>
                    <p className="text-sm text-foreground">{formatDateTime(worker.session_start_time)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pie Chart Card */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Clock className="h-5 w-5" />
                  Today's Activity Breakdown
                </CardTitle>
                <CardDescription>
                  {completionPercent.toFixed(1)}% of 8h workday complete
                  {overtimeSeconds > 0 && (
                    <span className="ml-2 text-status-working font-medium">
                      (+{formatSeconds(overtimeSeconds)} overtime)
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="45%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={1}
                        dataKey="value"
                        label={({ name, value, isRemaining }) => {
                          if (isRemaining) return null
                          const FULL_WORKDAY_SECONDS = 8 * 60 * 60
                          const percent = (value / FULL_WORKDAY_SECONDS) * 100
                          if (percent < 3) return null
                          return `${percent.toFixed(0)}%`
                        }}
                        labelLine={false}
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} opacity={entry.isRemaining ? 0.3 : 1} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload
                            const FULL_WORKDAY_SECONDS = 8 * 60 * 60
                            const percent = (data.value / FULL_WORKDAY_SECONDS) * 100
                            return (
                              <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
                                <p className="font-medium text-foreground">{data.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {formatSeconds(data.value)} ({percent.toFixed(1)}%)
                                </p>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        formatter={(value) => {
                          const item = pieChartData.find((d) => d.name === value)
                          if (!item) return value
                          return (
                            <span className={item.isRemaining ? "text-muted-foreground" : "text-foreground"}>
                              {value}
                            </span>
                          )
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Workday Progress</span>
                    <span className="font-medium text-foreground">{formatSeconds(totalWorkedSeconds)} / 8h</span>
                  </div>
                  <div className="h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(completionPercent, 100)}%`,
                        backgroundColor: completionPercent >= 100 ? "#22c55e" : "#3b82f6",
                      }}
                    />
                  </div>
                  {overtimeSeconds > 0 && (
                    <p className="text-xs text-amber-500">
                      Overtime: {formatSeconds(overtimeSeconds)} ({((overtimeSeconds / (8 * 60 * 60)) * 100).toFixed(1)}
                      % extra)
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Today's Schedule Card */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Calendar className="h-5 w-5" />
                  Today&apos;s Schedule
                </CardTitle>
                <CardDescription>Station assignments for today</CardDescription>
              </CardHeader>
              <CardContent>
                {operatorSchedule.length > 0 ? (
                  <div className="space-y-3">
                    {operatorSchedule.map((schedule, idx) => {
                      const isCurrentShift = schedule.shift_id === currentShiftId
                      return (
                        <div 
                          key={idx}
                          className={`
                            flex items-center justify-between p-3 rounded-lg border
                            ${isCurrentShift 
                              ? "border-primary bg-primary/5" 
                              : "border-border bg-muted/30"
                            }
                          `}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`
                              h-10 w-10 rounded-full flex items-center justify-center
                              ${isCurrentShift ? "bg-primary/20" : "bg-muted"}
                            `}>
                              <MapPin className={`h-5 w-5 ${isCurrentShift ? "text-primary" : "text-muted-foreground"}`} />
                            </div>
                            <div>
                              <p className={`font-medium ${isCurrentShift ? "text-primary" : "text-foreground"}`}>
                                {schedule.station_name || `Station ${schedule.station_id}`}
                                {isCurrentShift && <Badge className="ml-2 bg-primary/20 text-primary text-xs">Now</Badge>}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {schedule.shift?.shift_name} ({schedule.shift?.start_time.slice(0, 5)} - {schedule.shift?.end_time.slice(0, 5)})
                              </p>
                            </div>
                          </div>
                          <Link href={`/stations/${schedule.station_id}`}>
                            <Button variant="outline" size="sm" className="bg-transparent">
                              View Station
                            </Button>
                          </Link>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No assignments for today</p>
                    <p className="text-sm">This operator is not scheduled to work today</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Alerts Card */}
            <Card className={`border-border bg-card ${operatorAlerts.length > 0 ? "border-destructive/50" : ""}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Bell className={`h-5 w-5 ${operatorAlerts.length > 0 ? "text-destructive" : ""}`} />
                  Active Alerts
                </CardTitle>
                <CardDescription>
                  {operatorAlerts.length > 0 
                    ? `${operatorAlerts.length} open alerts for this operator`
                    : "No active alerts"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                {operatorAlerts.length > 0 ? (
                  <div className="space-y-3">
                    {operatorAlerts.map(alert => (
                      <div 
                        key={alert.id}
                        className={`
                          flex items-center justify-between p-3 rounded-lg border
                          ${alert.severity === "Error" 
                            ? "border-destructive/50 bg-destructive/10" 
                            : alert.severity === "Warning"
                              ? "border-status-break/50 bg-status-break/10"
                              : "border-status-idle/50 bg-status-idle/10"
                          }
                        `}
                      >
                        <div className="flex items-center gap-3">
                          {alert.alert_type === "OperatorNotPresent" && <UserX className="h-5 w-5 text-destructive" />}
                          {alert.alert_type === "OperatorIdle" && <Coffee className="h-5 w-5 text-status-idle" />}
                          {alert.alert_type === "OvertimeAlert" && <Clock className="h-5 w-5 text-status-idle" />}
                          {alert.alert_type === "CycleTooSlow" && <Timer className="h-5 w-5 text-status-break" />}
                          {alert.alert_type === "FastCycleRecord" && <Trophy className="h-5 w-5 text-status-working" />}
                          {!["OperatorNotPresent", "OperatorIdle", "OvertimeAlert", "CycleTooSlow", "FastCycleRecord"].includes(alert.alert_type) && (
                            <AlertTriangle className="h-5 w-5 text-status-break" />
                          )}
                          <div>
                            <p className="font-medium text-foreground text-sm">{alert.message}</p>
                            <p className="text-xs text-muted-foreground">
                              {alert.station_name} - {new Date(alert.created_at).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-7 text-xs bg-transparent"
                          onClick={async () => {
                            await updateAlertStatus(alert.id, "Acknowledged")
                            mutateAlerts()
                          }}
                        >
                          Ack
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No active alerts</p>
                    <p className="text-sm">This operator has no open issues</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Activity Feed Card - Full Width */}
            <Card className="border-border bg-card lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-foreground">Live Activity Feed</CardTitle>
                <CardDescription>Today's activity log (most recent first)</CardDescription>
              </CardHeader>
              <CardContent>
                {!todayActivity || todayActivity.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <p>No activity logs for today yet</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {[...todayActivity]
                      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
                      .map((log) => (
                        <ActivityFeedItem key={log.id} log={log} formatSeconds={formatSeconds} />
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

function ActivityFeedItem({ log, formatSeconds }: { log: ActivityLog; formatSeconds: (s: number) => string }) {
  const color = getActivityColor(log.activity_type)

  // Calculate duration from start_time and end_time
  let durationSeconds = 0
  if (log.start_time && log.end_time) {
    const start = new Date(log.start_time).getTime()
    const end = new Date(log.end_time).getTime()
    durationSeconds = Math.max(0, Math.floor((end - start) / 1000))
  } else if (log.duration_minutes) {
    durationSeconds = Number(log.duration_minutes) * 60
  }

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-3">
      <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-foreground truncate">{log.activity_type}</span>
          <span className="text-xs text-muted-foreground flex-shrink-0">{formatSeconds(durationSeconds)}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {formatTime(log.start_time)}
          {log.end_time && ` - ${formatTime(log.end_time)}`}
        </div>
      </div>
    </div>
  )
}
