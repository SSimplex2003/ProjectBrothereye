"use client"

import useSWR from "swr"
import { Users, Factory, Bell, Calendar } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { fetchCurrentWorkers, fetchStations, fetchAlerts } from "@/lib/api"
import { isStale } from "@/lib/utils"

export function StatsWidget() {
  const { data: workers } = useSWR("workers-current", fetchCurrentWorkers, { refreshInterval: 5000 })
  const { data: stations } = useSWR("stations", fetchStations, { refreshInterval: 10000 })
  const today = new Date().toISOString().split("T")[0]
  const { data: alerts } = useSWR(`alerts-${today}`, () => fetchAlerts(today, "Open"), { refreshInterval: 10000 })

  const activeWorkers = workers?.filter(w => !isStale(w.last_event_time)).length || 0
  const totalWorkers = workers?.length || 0
  const staleWorkers = totalWorkers - activeWorkers

  const activeStations = stations?.filter(s => s.is_active).length || 0
  const totalStations = stations?.length || 0

  const openAlerts = alerts?.length || 0

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Active Operators</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-foreground">{activeWorkers} / {totalWorkers}</div>
          {staleWorkers > 0 && (
            <p className="text-xs text-status-break mt-1">{staleWorkers} stale</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Active Stations</CardTitle>
          <Factory className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-foreground">{activeStations} / {totalStations}</div>
          <p className="text-xs text-muted-foreground mt-1">stations operational</p>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Open Alerts</CardTitle>
          <Bell className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${openAlerts > 0 ? "text-status-break" : "text-foreground"}`}>
            {openAlerts}
          </div>
          <p className="text-xs text-muted-foreground mt-1">require attention</p>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Today</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-foreground">
            {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
