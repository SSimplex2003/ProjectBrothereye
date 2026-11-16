"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import { Calendar, RefreshCw, AlertTriangle, Bell, CheckCircle2, Clock, Filter, Zap, UserX, Timer, Trophy, Coffee, Activity } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { 
  fetchAlerts, 
  updateAlertStatus,
  recomputeAlerts,
  type Alert 
} from "@/lib/api"

const ALERT_TYPE_ICONS: Record<string, typeof AlertTriangle> = {
  DataStale: Clock,
  MissingOperator: AlertTriangle,
  CycleTooSlow: Timer,
  UnexpectedBreak: Coffee,
  OperatorNotPresent: UserX,
  OperatorIdle: Coffee,
  OvertimeAlert: Clock,
  FastCycleRecord: Trophy,
}

const SEVERITY_COLORS: Record<string, string> = {
  Info: "bg-status-idle/20 text-status-idle",
  Warning: "bg-status-break/20 text-status-break",
  Error: "bg-destructive/20 text-destructive",
}

const STATUS_COLORS: Record<string, string> = {
  Open: "bg-status-break/20 text-status-break",
  Acknowledged: "bg-status-idle/20 text-status-idle",
  Resolved: "bg-status-working/20 text-status-working",
}

export default function AlertsPage() {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0])
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [isRecomputing, setIsRecomputing] = useState(false)

  const { data: alerts, isLoading, error, mutate } = useSWR(
    `alerts-${selectedDate}-${statusFilter}`,
    () => fetchAlerts(selectedDate, statusFilter === "all" ? undefined : statusFilter)
  )

  const filteredAlerts = useMemo(() => {
    if (!alerts) return []
    return alerts.filter(alert => {
      if (typeFilter !== "all" && alert.alert_type !== typeFilter) return false
      return true
    })
  }, [alerts, typeFilter])

  const alertTypes = useMemo(() => {
    if (!alerts) return []
    return [...new Set(alerts.map(a => a.alert_type))]
  }, [alerts])

  const alertCounts = useMemo(() => {
    if (!alerts) return { open: 0, acknowledged: 0, resolved: 0 }
    return {
      open: alerts.filter(a => a.status === "Open").length,
      acknowledged: alerts.filter(a => a.status === "Acknowledged").length,
      resolved: alerts.filter(a => a.status === "Resolved").length,
    }
  }, [alerts])

  const handleStatusChange = async (alertId: number, newStatus: "Open" | "Acknowledged" | "Resolved") => {
    try {
      await updateAlertStatus(alertId, newStatus)
      mutate()
    } catch (err) {
      console.error("Failed to update alert status:", err)
    }
  }

  const handleRecompute = async () => {
    setIsRecomputing(true)
    try {
      const result = await recomputeAlerts(selectedDate)
      console.log(`Recomputed alerts: ${result.alerts_created} created`)
      mutate()
    } catch (err) {
      console.error("Failed to recompute alerts:", err)
    } finally {
      setIsRecomputing(false)
    }
  }

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Alerts" description="System notifications and warnings">
        <Button variant="outline" size="sm" onClick={() => mutate()} className="gap-2 bg-transparent">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
        <Button 
          size="sm" 
          onClick={handleRecompute} 
          disabled={isRecomputing}
          className="gap-2"
        >
          {isRecomputing ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          Recompute Alerts
        </Button>
      </PageHeader>

      <div className="p-8">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Open</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-status-break">{alertCounts.open}</div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Acknowledged</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-status-idle">{alertCounts.acknowledged}</div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Resolved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-status-working">{alertCounts.resolved}</div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{alerts?.length || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="border-border bg-card mb-6">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-48 bg-card border-border"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="Open">Open</SelectItem>
                    <SelectItem value="Acknowledged">Acknowledged</SelectItem>
                    <SelectItem value="Resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Alert Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {alertTypes.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alerts Table */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Alerts for {new Date(selectedDate).toLocaleDateString()}</CardTitle>
            <CardDescription>{filteredAlerts.length} alerts found</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
                Failed to load alerts. Make sure the backend API is running.
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Bell className="h-12 w-12 mb-4" />
                <p>No alerts found</p>
                <p className="text-sm">Click "Recompute Alerts" to check for issues</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Type</TableHead>
                      <TableHead className="text-muted-foreground">Station</TableHead>
                      <TableHead className="text-muted-foreground">Shift</TableHead>
                      <TableHead className="text-muted-foreground">Worker</TableHead>
                      <TableHead className="text-muted-foreground">Message</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                      <TableHead className="text-muted-foreground">Time</TableHead>
                      <TableHead className="text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAlerts.map((alert) => {
                      const Icon = ALERT_TYPE_ICONS[alert.alert_type] || AlertTriangle
                      return (
                        <TableRow key={alert.id} className="border-border">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Icon className={`h-4 w-4 ${SEVERITY_COLORS[alert.severity]?.split(" ")[1] || "text-muted-foreground"}`} />
                              <span className="text-foreground text-sm">{alert.alert_type}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-foreground">{alert.station_name || "-"}</TableCell>
                          <TableCell className="text-foreground">{alert.shift_name || "-"}</TableCell>
                          <TableCell className="text-foreground">{alert.worker_name || "-"}</TableCell>
                          <TableCell className="max-w-xs">
                            <p className="text-sm text-foreground truncate" title={alert.message}>
                              {alert.message}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Badge className={STATUS_COLORS[alert.status]}>
                              {alert.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatTime(alert.created_at)}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={alert.status}
                              onValueChange={(value) => handleStatusChange(alert.id, value as Alert["status"])}
                            >
                              <SelectTrigger className="w-32 h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Open">Open</SelectItem>
                                <SelectItem value="Acknowledged">Acknowledge</SelectItem>
                                <SelectItem value="Resolved">Resolve</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alert Type Legend */}
        <div className="mt-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Alert Types Legend</h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-border bg-card">
              <CardContent className="py-3">
                <div className="flex items-center gap-2">
                  <UserX className="h-4 w-4 text-destructive" />
                  <div>
                    <p className="text-sm font-medium text-foreground">OperatorNotPresent</p>
                    <p className="text-xs text-muted-foreground">Assigned operator not detected</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="py-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-status-break" />
                  <div>
                    <p className="text-sm font-medium text-foreground">MissingOperator</p>
                    <p className="text-xs text-muted-foreground">No operator assigned to station</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="py-3">
                <div className="flex items-center gap-2">
                  <Coffee className="h-4 w-4 text-status-idle" />
                  <div>
                    <p className="text-sm font-medium text-foreground">OperatorIdle</p>
                    <p className="text-xs text-muted-foreground">Operator idle for extended time</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="py-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-status-idle" />
                  <div>
                    <p className="text-sm font-medium text-foreground">OvertimeAlert</p>
                    <p className="text-xs text-muted-foreground">Operator working past shift end</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="py-3">
                <div className="flex items-center gap-2">
                  <Timer className="h-4 w-4 text-status-break" />
                  <div>
                    <p className="text-sm font-medium text-foreground">CycleTooSlow</p>
                    <p className="text-xs text-muted-foreground">Avg cycle exceeds tolerance</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="py-3">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-status-working" />
                  <div>
                    <p className="text-sm font-medium text-foreground">FastCycleRecord</p>
                    <p className="text-xs text-muted-foreground">New cycle time record set</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="py-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-status-break" />
                  <div>
                    <p className="text-sm font-medium text-foreground">DataStale</p>
                    <p className="text-xs text-muted-foreground">No recent data from worker</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="py-3">
                <div className="flex items-center gap-2">
                  <Coffee className="h-4 w-4 text-status-break" />
                  <div>
                    <p className="text-sm font-medium text-foreground">UnexpectedBreak</p>
                    <p className="text-xs text-muted-foreground">Excessive break/idle time</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
