"use client"

import { useRouter } from "next/navigation"
import useSWR from "swr"
import { Bell, AlertTriangle, Clock, RefreshCw, CheckCircle2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { fetchAlerts } from "@/lib/api"

const ALERT_TYPE_ICONS: Record<string, typeof AlertTriangle> = {
  DataStale: Clock,
  MissingOperator: AlertTriangle,
  CycleTooSlow: RefreshCw,
  UnexpectedBreak: AlertTriangle,
}

const SEVERITY_COLORS: Record<string, string> = {
  Info: "bg-status-idle/20 text-status-idle",
  Warning: "bg-status-break/20 text-status-break",
  Error: "bg-destructive/20 text-destructive",
}

interface AlertsListWidgetProps {
  config?: {
    limit?: number
  }
}

export function AlertsListWidget({ config }: AlertsListWidgetProps) {
  const limit = config?.limit || 5
  const router = useRouter()
  const today = new Date().toISOString().split("T")[0]
  const { data: alerts } = useSWR(`alerts-${today}-Open`, () => fetchAlerts(today, "Open"), { refreshInterval: 10000 })

  const displayAlerts = alerts?.slice(0, limit) || []
  const totalOpen = alerts?.length || 0

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <CardTitle className="text-foreground">Open Alerts</CardTitle>
          </div>
          {totalOpen > 0 && (
            <Badge className="bg-status-break/20 text-status-break">{totalOpen}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {displayAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mb-2 text-status-working" />
            <p className="text-sm">All systems normal</p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayAlerts.map((alert) => {
              const Icon = ALERT_TYPE_ICONS[alert.alert_type] || AlertTriangle
              return (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 p-2 rounded-lg border border-border hover:border-primary/50 cursor-pointer transition-colors"
                  onClick={() => router.push("/alerts")}
                >
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${SEVERITY_COLORS[alert.severity]?.split(" ")[1] || "text-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{alert.alert_type}</span>
                      <Badge variant="outline" className="text-xs">
                        {alert.station_name || "System"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{alert.message}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{formatTime(alert.created_at)}</span>
                </div>
              )
            })}
            {totalOpen > limit && (
              <button
                onClick={() => router.push("/alerts")}
                className="w-full py-2 text-sm text-primary hover:underline"
              >
                View all {totalOpen} alerts
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
