"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import { Calendar, Download, RefreshCw } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fetchSummary, type ActivitySummary } from "@/lib/api"
import { formatDuration, downloadCSV } from "@/lib/utils"

export default function SummaryPage() {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0])

  const {
    data: summary,
    isLoading,
    error,
    mutate,
  } = useSWR(`summary-${selectedDate}`, () => fetchSummary(selectedDate))

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

  const handleExportCSV = () => {
    if (!summary || summary.length === 0) return
    downloadCSV(
      summary.map((s) => ({
        Worker: s.worker_name,
        Activity: s.activity_type,
        "Total Minutes": s.total_minutes,
        "Formatted Duration": formatDuration(s.total_minutes),
      })),
      `activity-summary-${selectedDate}.csv`,
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Daily Summary" description="Aggregated activity totals by operator">
        <Button variant="outline" size="sm" onClick={() => mutate()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={handleExportCSV}
          disabled={!summary || summary.length === 0}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </PageHeader>

      <div className="p-8">
        <div className="mb-6">
          <div className="relative w-fit">
            <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-48 pl-10 bg-card border-border"
            />
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            Failed to load summary. Make sure the backend API is running.
          </div>
        )}

        {!isLoading && !error && summary?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p>No activity data for this date</p>
          </div>
        )}

        {Object.keys(groupedByWorker).length > 0 && (
          <div className="space-y-6">
            {Object.entries(groupedByWorker).map(([worker, activities]) => (
              <div key={worker} className="rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                  <h3 className="font-semibold text-foreground">{worker}</h3>
                  <span className="text-sm text-muted-foreground">Total: {formatDuration(workerTotals[worker])}</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Activity Type</TableHead>
                      <TableHead className="text-right text-muted-foreground">Duration</TableHead>
                      <TableHead className="text-right text-muted-foreground">Percentage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activities.map((activity, idx) => {
                      const percentage = workerTotals[worker]
                        ? Math.round((activity.total_minutes / workerTotals[worker]) * 100)
                        : 0
                      return (
                        <TableRow key={idx} className="border-border">
                          <TableCell>
                            <StatusBadge status={activity.activity_type} />
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatDuration(activity.total_minutes)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                                <div className="h-full bg-primary" style={{ width: `${percentage}%` }} />
                              </div>
                              <span className="w-10 text-right text-sm text-muted-foreground">{percentage}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
