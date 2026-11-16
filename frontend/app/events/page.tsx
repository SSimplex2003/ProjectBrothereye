"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import { RefreshCw, Activity, Clock, Filter } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { CameraEvent } from "@/lib/stream-server"

async function fetchAllEvents(): Promise<CameraEvent[]> {
  const res = await fetch("/api/stream/events")
  if (!res.ok) return []
  const data = await res.json()
  return data.events || []
}

export default function EventsPage() {
  const [completedOnly, setCompletedOnly] = useState(true)

  const { data: events, isLoading, error, mutate } = useSWR(
    "all-events",
    fetchAllEvents,
    { refreshInterval: 3000 }
  )

  const filteredEvents = useMemo(() => {
    if (!events) return []
    if (completedOnly) {
      return events.filter(e => e.is_log === true)
    }
    return events
  }, [events, completedOnly])

  const completedCount = useMemo(() => {
    return events?.filter(e => e.is_log === true).length || 0
  }, [events])

  const liveCount = useMemo(() => {
    return events?.filter(e => !e.is_log).length || 0
  }, [events])

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Events" description="Live detections and completed activity segments">
        <Button variant="outline" size="sm" onClick={() => mutate()} className="gap-2 bg-transparent">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </PageHeader>

      <div className="p-4 sm:p-6 lg:p-8">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Events</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{events?.length || 0}</div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completed Segments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-teal-500">{completedCount}</div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Live Detections</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">{liveCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Toggle */}
        <Card className="border-border bg-card mb-6">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Switch
                id="completed-only"
                checked={completedOnly}
                onCheckedChange={setCompletedOnly}
              />
              <Label htmlFor="completed-only" className="cursor-pointer">
                Completed segments only
              </Label>
              {!completedOnly && (
                <span className="text-sm text-muted-foreground">
                  (Showing all {events?.length || 0} events)
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Events Table */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Activity className="h-5 w-5" />
              {completedOnly ? "Completed Segments" : "All Events"}
            </CardTitle>
            <CardDescription>{filteredEvents.length} events</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
                Failed to load events. Make sure the streaming server is running.
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Activity className="h-12 w-12 mb-4 opacity-50" />
                <p>No events found</p>
                {completedOnly && (
                  <p className="text-sm mt-1">Try disabling the "Completed segments only" filter</p>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Activity</TableHead>
                      <TableHead className="text-muted-foreground">Camera</TableHead>
                      <TableHead className="text-muted-foreground">Worker</TableHead>
                      <TableHead className="text-muted-foreground">Confidence</TableHead>
                      {completedOnly && (
                        <TableHead className="text-muted-foreground">Duration</TableHead>
                      )}
                      <TableHead className="text-muted-foreground">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEvents.slice(0, 100).map((event, i) => (
                      <TableRow
                        key={i}
                        className={`border-border ${
                          event.is_log
                            ? "border-l-2 border-l-teal-500"
                            : ""
                        }`}
                      >
                        <TableCell className={event.is_log ? "text-foreground font-medium" : "text-muted-foreground"}>
                          {event.activity_type}
                        </TableCell>
                        <TableCell className={event.is_log ? "text-foreground" : "text-muted-foreground"}>
                          {event.camera_id}
                        </TableCell>
                        <TableCell className={event.is_log ? "text-foreground" : "text-muted-foreground"}>
                          {event.worker_name || "-"}
                        </TableCell>
                        <TableCell className={event.is_log ? "text-foreground" : "text-muted-foreground"}>
                          {(event.confidence * 100).toFixed(0)}%
                        </TableCell>
                        {completedOnly && (
                          <TableCell>
                            {event.is_log && event.duration_minutes ? (
                              <Badge variant="secondary" className="bg-teal-500/20 text-teal-400">
                                {event.duration_minutes.toFixed(1)} min
                              </Badge>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-muted-foreground text-sm">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(event.event_time).toLocaleTimeString()}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
