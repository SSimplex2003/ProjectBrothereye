"use client"

import Link from "next/link"
import useSWR from "swr"
import { Factory, Activity, Bell, Calendar, History, BarChart3, RotateCw, CheckCircle2, Clock, AlertTriangle, Camera } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { fetchCurrentWorkers, fetchStations, fetchAlerts, fetchCycleTemplates, fetchCameras } from "@/lib/api"
import { isStale } from "@/lib/utils"

export function QuickLinksWidget() {
  const { data: workers } = useSWR("workers-current", fetchCurrentWorkers, { refreshInterval: 5000 })
  const { data: stations } = useSWR("stations", fetchStations, { refreshInterval: 10000 })
  const { data: cycleTemplates } = useSWR("cycle-templates", () => fetchCycleTemplates())
  const { data: cameras } = useSWR("cameras", fetchCameras)
  const today = new Date().toISOString().split("T")[0]
  const { data: alerts } = useSWR(`alerts-${today}`, () => fetchAlerts(today, "Open"), { refreshInterval: 10000 })

  const activeWorkers = workers?.filter(w => !isStale(w.last_event_time)).length || 0
  const activeStations = stations?.filter(s => s.is_active).length || 0
  const openAlerts = alerts?.length || 0

  const links = [
    {
      href: "/stations",
      icon: Factory,
      title: "Stations",
      description: "Manage workstations",
      stat: `${activeStations} active`,
      StatIcon: CheckCircle2,
      statColor: "text-status-working",
    },
    {
      href: "/planning",
      icon: Calendar,
      title: "Planning",
      description: "Daily schedules",
      stat: "Schedule assignments",
      StatIcon: Clock,
      statColor: "text-muted-foreground",
    },
    {
      href: "/alerts",
      icon: Bell,
      title: "Alerts",
      description: "View notifications",
      stat: openAlerts > 0 ? `${openAlerts} require attention` : "All systems normal",
      StatIcon: openAlerts > 0 ? AlertTriangle : CheckCircle2,
      statColor: openAlerts > 0 ? "text-status-break" : "text-status-working",
    },
    {
      href: "/live",
      icon: Activity,
      title: "Live Monitor",
      description: "Real-time tracking",
      stat: `${activeWorkers} currently active`,
      StatIcon: null,
      statColor: "text-muted-foreground",
      pulse: true,
    },
    {
      href: "/cycles",
      icon: RotateCw,
      title: "Cycle Templates",
      description: "Define work cycles",
      stat: `${cycleTemplates?.length || 0} templates`,
      StatIcon: null,
      statColor: "text-muted-foreground",
    },
    {
      href: "/cameras",
      icon: Camera,
      title: "Cameras",
      description: "Camera management",
      stat: `${cameras?.length || 0} cameras`,
      StatIcon: null,
      statColor: "text-muted-foreground",
    },
    {
      href: "/history",
      icon: History,
      title: "History",
      description: "Activity logs",
      stat: "View detailed logs",
      StatIcon: null,
      statColor: "text-muted-foreground",
    },
    {
      href: "/summary",
      icon: BarChart3,
      title: "Summary",
      description: "Daily statistics",
      stat: "View aggregated data",
      StatIcon: null,
      statColor: "text-muted-foreground",
    },
  ]

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {links.map((link) => (
        <Link key={link.href} href={link.href}>
          <Card className="border-border bg-card hover:border-primary/50 transition-colors cursor-pointer h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <link.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-foreground text-sm">{link.title}</CardTitle>
                  <CardDescription className="text-xs truncate">{link.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className={`flex items-center gap-2 text-xs ${link.statColor}`}>
                {link.pulse && (
                  <div className="h-2 w-2 animate-pulse rounded-full bg-status-working" />
                )}
                {link.StatIcon && <link.StatIcon className="h-3 w-3" />}
                <span className="truncate">{link.stat}</span>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}
