"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import { Calendar, Download, RefreshCw, User, BarChart3, List, Clock, CalendarRange } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fetchWorkers, fetchActivity, fetchSummary, type ActivityLog, type ActivitySummary } from "@/lib/api"
import { formatDuration, formatTime, downloadCSV } from "@/lib/utils"

export default function HistoryPage() {
  const [selectedWorker, setSelectedWorker] = useState<string>("all")
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split("T")[0])
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split("T")[0])
  const [activeTab, setActiveTab] = useState<string>("summary")

  const { data: workers, isLoading: workersLoading } = useSWR("workers-list", fetchWorkers)

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
    mutate: mutateSummary,
  } = useSWR(`summary-${startDate}-${endDate}`, () => fetchSummary(startDate, endDate))

  const {
    data: activities,
    isLoading: activitiesLoading,
    error: activitiesError,
    mutate: mutateActivities,
  } = useSWR(
    selectedWorker && selectedWorker !== "all" ? `activity-${selectedWorker}-${startDate}-${endDate}` : null,
    () => fetchActivity(selectedWorker, startDate, endDate)
  )

  const isDateRange = startDate !== endDate

  const groupedByWorker = useMemo(() => {
    if (!summary) return {}
    return summary.reduce<Record<string, ActivitySummary[]>>((acc, item) => {
      if (!acc[item.worker_name]) {
        acc[item.worker_name] = []
      }
      acc[item.worker_name].push(item)
      return acc
    }, {})
  }, [summary])

  const workerTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    Object.entries(groupedByWorker).forEach(([worker, activities]) => {
      totals[worker] = activities.reduce((sum, a) => sum + a.total_minutes, 0)
    })
    return totals
  }, [groupedByWorker])

  const grandTotals = useMemo(() => {
    if (!summary) return { working: 0, break: 0, idle: 0, total: 0, workers: 0 }
    const byType: Record<string, number> = {}
    summary.forEach((s) => {
      byType[s.activity_type] = (byType[s.activity_type] || 0) + s.total_minutes
    })
    return {
      working: byType["Working"] || 0,
      break: byType["Break"] || 0,
      idle: byType["Idle"] || 0,
      total: Object.values(byType).reduce((a, b) => a + b, 0),
      workers: Object.keys(groupedByWorker).length,
    }
  }, [summary, groupedByWorker])

  const activityTotals = useMemo(() => {
    if (!activities) return 0
    return activities.reduce((sum, a) => sum + (a.duration_minutes || 0), 0)
  }, [activities])

  const dateRangeLabel = useMemo(() => {
    if (startDate === endDate) return startDate
    return `${startDate} to ${endDate}`
  }, [startDate, endDate])

  const daysInRange = useMemo(() => {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const diffTime = Math.abs(end.getTime() - start.getTime())
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
  }, [startDate, endDate])

  const handleExportCSV = () => {
    if (!summary || summary.length === 0) return
    downloadCSV(
      summary.map((s) => ({
        Worker: s.worker_name,
        Activity: s.activity_type,
        "Total Minutes": s.total_minutes,
        "Formatted Duration": formatDuration(s.total_minutes),
        "Date Range": dateRangeLabel,
      })),
      `activity-summary-${startDate}${isDateRange ? `-to-${endDate}` : ""}.csv`
    )
  }

  const handleExportDetailedCSV = () => {
    if (!activities || activities.length === 0) return
    downloadCSV(
      activities.map((a) => ({
        Worker: a.worker_name,
        Activity: a.activity_type,
        "Start Time": a.start_time,
        "End Time": a.end_time || "Ongoing",
        "Duration (minutes)": a.duration_minutes || 0,
        "Formatted Duration": a.duration_minutes ? formatDuration(a.duration_minutes) : "-",
      })),
      `activity-detailed-${selectedWorker}-${startDate}${isDateRange ? `-to-${endDate}` : ""}.csv`
    )
  }

  const handleRefresh = () => {
    mutateSummary()
    mutateActivities()
  }

  const setDatePreset = (preset: string) => {
    const today = new Date()
    let start: Date
    let end: Date = today

    switch (preset) {
      case "today":
        start = today
        end = today
        break
      case "yesterday":
        start = new Date(today)
        start.setDate(start.getDate() - 1)
        end = start
        break
      case "last7":
        start = new Date(today)
        start.setDate(start.getDate() - 6)
        break
      case "last30":
        start = new Date(today)
        start.setDate(start.getDate() - 29)
        break
      case "thisWeek":
        start = new Date(today)
        start.setDate(start.getDate() - start.getDay() + 1)
        break
      case "thisMonth":
        start = new Date(today.getFullYear(), today.getMonth(), 1)
        break
      default:
        return
    }

    setStartDate(start.toISOString().split("T")[0])
    setEndDate(end.toISOString().split("T")[0])
  }

  const isLoading = summaryLoading || (selectedWorker !== "all" && activitiesLoading)
  const error = summaryError || activitiesError

  const filteredSummary = useMemo(() => {
    if (selectedWorker === "all") return groupedByWorker
    if (!groupedByWorker[selectedWorker]) return {}
    return { [selectedWorker]: groupedByWorker[selectedWorker] }
  }, [groupedByWorker, selectedWorker])

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="History & Summary" description="Activity history and summaries for operators">
        <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2 bg-transparent">
          <RefreshCw className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={handleExportCSV}
          disabled={!summary || summary.length === 0}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Export CSV</span>
        </Button>
      </PageHeader>

      <div className="p-4 sm:p-6 lg:p-8">
        {/* Filters */}
        <div className="mb-6 space-y-4">
          {/* Date Range Selection */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex items-center gap-2">
                <CalendarRange className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                  <div className="w-full sm:w-auto">
                    <Label className="text-xs text-muted-foreground">From</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value)
                        if (e.target.value > endDate) {
                          setEndDate(e.target.value)
                        }
                      }}
                      className="w-full sm:w-36 bg-card border-border text-sm"
                    />
                  </div>
                  <div className="w-full sm:w-auto">
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value)
                        if (e.target.value < startDate) {
                          setStartDate(e.target.value)
                        }
                      }}
                      min={startDate}
                      className="w-full sm:w-36 bg-card border-border text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setDatePreset("today")} className="text-xs h-7 px-2">
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDatePreset("yesterday")} className="text-xs h-7 px-2">
                Yesterday
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDatePreset("last7")} className="text-xs h-7 px-2">
                7 Days
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDatePreset("last30")} className="text-xs h-7 px-2">
                30 Days
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDatePreset("thisWeek")} className="text-xs h-7 px-2">
                This Week
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDatePreset("thisMonth")} className="text-xs h-7 px-2">
                This Month
              </Button>
            </div>
          </div>

          {/* Worker Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={selectedWorker} onValueChange={setSelectedWorker} disabled={workersLoading}>
                <SelectTrigger className="w-full sm:w-48 bg-card border-border">
                  <SelectValue placeholder="All Operators" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Operators</SelectItem>
                  {workers?.map((worker) => (
                    <SelectItem key={worker} value={worker}>
                      {worker}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isDateRange && (
              <span className="text-sm text-muted-foreground">
                Showing {daysInRange} day{daysInRange !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
          <Card className="border-border bg-card">
            <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Operators</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
              <div className="text-xl sm:text-2xl font-bold text-foreground">{grandTotals.workers}</div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Working</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
              <div className="text-xl sm:text-2xl font-bold text-status-working">{formatDuration(grandTotals.working)}</div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Break</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
              <div className="text-xl sm:text-2xl font-bold text-status-break">{formatDuration(grandTotals.break)}</div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Idle</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
              <div className="text-xl sm:text-2xl font-bold text-status-idle">{formatDuration(grandTotals.idle)}</div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card col-span-2 sm:col-span-1">
            <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Total Time</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
              <div className="text-xl sm:text-2xl font-bold text-foreground">{formatDuration(grandTotals.total)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Loading/Error States */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
            Failed to load data. Make sure the backend API is running.
          </div>
        )}

        {/* Tabs for Summary vs Detailed View */}
        {!isLoading && !error && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4 w-full sm:w-auto">
              <TabsTrigger value="summary" className="gap-2 flex-1 sm:flex-none">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Summary</span>
              </TabsTrigger>
              <TabsTrigger value="detailed" className="gap-2 flex-1 sm:flex-none" disabled={selectedWorker === "all"}>
                <List className="h-4 w-4" />
                <span className="hidden sm:inline">Detailed</span>
              </TabsTrigger>
            </TabsList>

            {/* Summary Tab */}
            <TabsContent value="summary">
              {Object.keys(filteredSummary).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Clock className="h-12 w-12 mb-4" />
                  <p className="text-center">No activity data for this date range</p>
                </div>
              ) : (
                <div className="space-y-4 sm:space-y-6">
                  {Object.entries(filteredSummary).map(([worker, workerActivities]) => (
                    <Card key={worker} className="border-border bg-card overflow-hidden">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border px-4 sm:px-6 py-3 sm:py-4 gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm sm:text-base">
                            {worker.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground text-sm sm:text-base">{worker}</h3>
                            <span className="text-xs sm:text-sm text-muted-foreground">
                              Total: {formatDuration(workerTotals[worker])}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedWorker(worker)
                            setActiveTab("detailed")
                          }}
                          className="gap-2 w-full sm:w-auto"
                        >
                          <List className="h-4 w-4" />
                          View Details
                        </Button>
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-border hover:bg-transparent">
                              <TableHead className="text-muted-foreground text-xs sm:text-sm">Activity</TableHead>
                              <TableHead className="text-right text-muted-foreground text-xs sm:text-sm">Duration</TableHead>
                              <TableHead className="text-right text-muted-foreground text-xs sm:text-sm hidden sm:table-cell">Percentage</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {workerActivities.map((activity, idx) => {
                              const percentage = workerTotals[worker]
                                ? Math.round((activity.total_minutes / workerTotals[worker]) * 100)
                                : 0
                              return (
                                <TableRow key={idx} className="border-border">
                                  <TableCell className="py-2 sm:py-4">
                                    <StatusBadge status={activity.activity_type} />
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs sm:text-sm py-2 sm:py-4">
                                    {formatDuration(activity.total_minutes)}
                                  </TableCell>
                                  <TableCell className="text-right py-2 sm:py-4 hidden sm:table-cell">
                                    <div className="flex items-center justify-end gap-2">
                                      <div className="h-2 w-12 sm:w-16 overflow-hidden rounded-full bg-muted">
                                        <div className="h-full bg-primary" style={{ width: `${percentage}%` }} />
                                      </div>
                                      <span className="w-8 sm:w-10 text-right text-xs sm:text-sm text-muted-foreground">{percentage}%</span>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Detailed Activity Tab */}
            <TabsContent value="detailed">
              {selectedWorker === "all" ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <User className="h-12 w-12 mb-4" />
                  <p className="text-center">Select a specific operator to view detailed activity</p>
                </div>
              ) : activitiesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !activities || activities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Clock className="h-12 w-12 mb-4" />
                  <p className="text-center">No detailed activity found for this operator</p>
                </div>
              ) : (
                <>
                  {/* Worker Activity Summary Bar */}
                  <Card className="mb-4 sm:mb-6 border-border bg-card">
                    <CardContent className="py-3 sm:py-4 px-4 sm:px-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm sm:text-base">
                            {selectedWorker.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground text-sm sm:text-base">{selectedWorker}</p>
                            <p className="text-xs sm:text-sm text-muted-foreground">{dateRangeLabel}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs sm:text-sm text-muted-foreground">
                            {activities.length} segments | {formatDuration(activityTotals)}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExportDetailedCSV}
                            className="gap-2"
                          >
                            <Download className="h-4 w-4" />
                            <span className="hidden sm:inline">Export</span>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Activity Table */}
                  <Card className="border-border bg-card overflow-hidden">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border hover:bg-transparent">
                            <TableHead className="text-muted-foreground text-xs sm:text-sm">Activity</TableHead>
                            <TableHead className="text-muted-foreground text-xs sm:text-sm">Start</TableHead>
                            <TableHead className="text-muted-foreground text-xs sm:text-sm hidden sm:table-cell">End</TableHead>
                            <TableHead className="text-right text-muted-foreground text-xs sm:text-sm">Duration</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activities.map((activity) => (
                            <TableRow key={activity.id} className="border-border">
                              <TableCell className="py-2 sm:py-4">
                                <StatusBadge status={activity.activity_type} />
                              </TableCell>
                              <TableCell className="font-mono text-xs sm:text-sm py-2 sm:py-4">
                                {formatTime(activity.start_time)}
                              </TableCell>
                              <TableCell className="font-mono text-xs sm:text-sm py-2 sm:py-4 hidden sm:table-cell">
                                {activity.end_time ? formatTime(activity.end_time) : "-"}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs sm:text-sm py-2 sm:py-4">
                                {activity.duration_minutes ? formatDuration(activity.duration_minutes) : "-"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>
                </>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
