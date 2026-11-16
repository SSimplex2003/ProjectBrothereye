"use client"

import { useState, useMemo, use } from "react"
import useSWR from "swr"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, RefreshCw, Plus, Trash2, GripVertical, Clock, Pencil, Save, X, User, Activity, Video, UserCheck, UserX, Coffee, AlertTriangle, Trophy, Timer, Bell, Calendar, TrendingUp, Users } from "lucide-react"
import { LiveStreamViewer } from "@/components/live-stream-viewer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/page-header"
import { 
  fetchStations, 
  fetchCycleTemplates, 
  fetchCycleSteps,
  fetchPlanning,
  fetchActivity,
  fetchCurrentWorkers,
  fetchAlerts,
  fetchShifts,
  createCycleStep,
  updateCycleStep,
  deleteCycleStep,
  updateStation,
  updateAlertStatus,
  type Station, 
  type CycleTemplate,
  type CycleStep,
  type Alert,
  type Shift
} from "@/lib/api"
import { isStale } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { fetchStreamEvents, type CameraEvent } from "@/lib/stream-server"

export default function StationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const stationId = parseInt(id)
  const router = useRouter()
  const [isFullscreen, setIsFullscreen] = useState(false)

  const { data: stations, mutate: mutateStations } = useSWR("stations", fetchStations)
  const station = stations?.find(s => s.id === stationId)
  
  const { data: templates } = useSWR("cycle-templates", () => fetchCycleTemplates())
  const { data: steps, mutate: mutateSteps } = useSWR(
    station?.cycle_template_id ? `steps-${station.cycle_template_id}` : null,
    () => station?.cycle_template_id ? fetchCycleSteps(station.cycle_template_id) : Promise.resolve([])
  )
  
  const today = new Date().toISOString().split("T")[0]
  
  // Get shifts
  const { data: shifts } = useSWR("shifts", fetchShifts)
  
  // Get current workers for presence status
  const { data: currentWorkers } = useSWR("workers-current", fetchCurrentWorkers, { refreshInterval: 5000 })
  
  // Get today's planning to find assigned operator
  const { data: planning } = useSWR(
    station ? `planning-${today}` : null,
    () => fetchPlanning(today)
  )
  
  // Get alerts for this station
  const { data: stationAlerts, mutate: mutateAlerts } = useSWR(
    station ? `alerts-station-${stationId}-${today}` : null,
    () => fetchAlerts(today),
    { refreshInterval: 30000 }
  )
  
  // Filter alerts for this station only
  const relevantAlerts = useMemo(() => {
    return stationAlerts?.filter(a => a.station_id === stationId && a.status === "Open") || []
  }, [stationAlerts, stationId])
  
  // Find all planning entries for this station (across all shifts)
  const stationPlans = useMemo(() => {
    return planning?.filter(p => p.station_id === stationId) || []
  }, [planning, stationId])
  
  // Get current shift based on time
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
  
  // Find the current plan based on current shift
  const currentPlan = stationPlans.find(p => p.shift_id === currentShiftId) || stationPlans[0]
  const assignedOperator = currentPlan?.worker_name || station?.expected_operator_name
  
  // Get operator activity if we have an operator
  const { data: operatorActivity } = useSWR(
    assignedOperator ? `activity-${assignedOperator}-${today}` : null,
    () => assignedOperator ? fetchActivity(assignedOperator, today) : null
  )
  
  // Get camera events if station has a camera
  const { data: cameraEvents } = useSWR<CameraEvent[]>(
    station?.camera_id ? `camera-events-station-${station.camera_id}` : null,
    () => station?.camera_id ? fetchStreamEvents(station.camera_id.toString()) : null,
    { refreshInterval: 3000 }
  )
  
  // Calculate operator stats
  const workingMinutes = operatorActivity?.filter(a => a.activity_type === "Working").reduce((sum, a) => sum + a.duration_minutes, 0) || 0
  const breakMinutes = operatorActivity?.filter(a => a.activity_type === "Break" || a.activity_type === "Idle").reduce((sum, a) => sum + a.duration_minutes, 0) || 0

  const [editingStepId, setEditingStepId] = useState<number | null>(null)
  const [newStepName, setNewStepName] = useState("")
  const [newStepSeconds, setNewStepSeconds] = useState("")
  const [isAddingStep, setIsAddingStep] = useState(false)

  const totalCycleTime = useMemo(() => {
    if (!steps) return 0
    return steps.reduce((sum, step) => sum + step.expected_seconds, 0)
  }, [steps])

  const handleTemplateChange = async (templateId: string) => {
    if (!station) return
    try {
      await updateStation(station.id, {
        cycle_template_id: templateId ? parseInt(templateId) : null
      })
      mutateStations()
    } catch (err) {
      console.error("Failed to update template:", err)
    }
  }

  const handleAddStep = async () => {
    if (!station?.cycle_template_id || !newStepName || !newStepSeconds) return
    try {
      await createCycleStep(station.cycle_template_id, {
        step_name: newStepName,
        expected_seconds: parseInt(newStepSeconds),
        step_order: (steps?.length || 0) + 1
      })
      setNewStepName("")
      setNewStepSeconds("")
      setIsAddingStep(false)
      mutateSteps()
    } catch (err) {
      console.error("Failed to add step:", err)
    }
  }

  const handleUpdateStep = async (step: CycleStep, updates: Partial<CycleStep>) => {
    try {
      await updateCycleStep(step.id, updates)
      setEditingStepId(null)
      mutateSteps()
    } catch (err) {
      console.error("Failed to update step:", err)
    }
  }

  const handleDeleteStep = async (stepId: number) => {
    try {
      await deleteCycleStep(stepId)
      mutateSteps()
    } catch (err) {
      console.error("Failed to delete step:", err)
    }
  }

  if (!station) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title="Station Not Found" description="The requested station does not exist">
          <Button variant="outline" onClick={() => router.push("/stations")} className="gap-2 bg-transparent">
            <ArrowLeft className="h-4 w-4" />
            Back to Stations
          </Button>
        </PageHeader>
      </div>
    )
  }

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">{station.name} - Live Feed</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsFullscreen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-hidden">
          <LiveStreamViewer
            cameraName={station.name}
            streamUrl={station.camera_stream_url || station.camera_stream_url_default || null}
            mode={station.camera_mode || "mjpeg"}
            cameraId={station.camera_id || undefined}
            isFullscreen={true}
            onFullscreenChange={setIsFullscreen}
          />
        </div>
      </div>
    )
  }

  const currentTemplate = templates?.find(t => t.id === station.cycle_template_id)

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title={station.name} description={`${station.station_type} workstation`}>
        <Button variant="outline" onClick={() => router.push("/stations")} className="gap-2 bg-transparent">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button variant="outline" size="sm" onClick={() => { mutateStations(); mutateSteps() }} className="gap-2 bg-transparent">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </PageHeader>

      <div className="p-8 space-y-6">
        {/* Station Info Card */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Station Information</CardTitle>
            <CardDescription>Basic configuration for this workstation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label className="text-muted-foreground">Type</Label>
                <p className="text-foreground font-medium">{station.station_type}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Status</Label>
                <div className="mt-1">
                  {station.is_active ? (
                    <Badge className="bg-status-working/20 text-status-working">Active</Badge>
                  ) : (
                    <Badge className="bg-status-offline/20 text-status-offline">Inactive</Badge>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Has Robot</Label>
                <p className="text-foreground font-medium">{station.has_robot ? "Yes" : "No"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Notes</Label>
                <p className="text-foreground text-sm">{station.notes || "None"}</p>
              </div>
            </div>
            </CardContent>
        </Card>

        {/* Today's Schedule Card - Shows all shifts */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Today&apos;s Schedule
            </CardTitle>
            <CardDescription>Operator assignments for each shift</CardDescription>
          </CardHeader>
          <CardContent>
            {shifts && shifts.length > 0 ? (
              <div className="space-y-3">
                {shifts.map(shift => {
                  const plan = stationPlans.find(p => p.shift_id === shift.id)
                  const isCurrentShift = shift.id === currentShiftId
                  const workerPresence = plan?.worker_name && currentWorkers?.find(w => w.worker_name === plan.worker_name)
                  const isWorkerActive = workerPresence && !isStale(workerPresence.last_event_time)
                  
                  return (
                    <div 
                      key={shift.id}
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
                          <Clock className={`h-5 w-5 ${isCurrentShift ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div>
                          <p className={`font-medium ${isCurrentShift ? "text-primary" : "text-foreground"}`}>
                            {shift.shift_name}
                            {isCurrentShift && <Badge className="ml-2 bg-primary/20 text-primary text-xs">Active</Badge>}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {plan?.worker_name ? (
                          <div className="flex items-center gap-2">
                            {isCurrentShift && (
                              isWorkerActive ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <UserCheck className="h-4 w-4 text-status-working" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Operator is active</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <UserX className="h-4 w-4 text-destructive" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Operator not detected</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )
                            )}
                            <Link href={`/operator/${encodeURIComponent(plan.worker_name)}`}>
                              <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                                <User className="h-3 w-3 mr-1" />
                                {plan.worker_name}
                              </Badge>
                            </Link>
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Unassigned
                          </Badge>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No shifts configured</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alerts for this Station */}
        {relevantAlerts.length > 0 && (
          <Card className="border-destructive/50 bg-card">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Bell className="h-5 w-5 text-destructive" />
                Active Alerts
              </CardTitle>
              <CardDescription>{relevantAlerts.length} open alerts for this station</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {relevantAlerts.map(alert => (
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
                      {alert.alert_type === "MissingOperator" && <AlertTriangle className="h-5 w-5 text-status-break" />}
                      {alert.alert_type === "OperatorIdle" && <Coffee className="h-5 w-5 text-status-idle" />}
                      {alert.alert_type === "OvertimeAlert" && <Clock className="h-5 w-5 text-status-idle" />}
                      {alert.alert_type === "CycleTooSlow" && <Timer className="h-5 w-5 text-status-break" />}
                      {alert.alert_type === "FastCycleRecord" && <Trophy className="h-5 w-5 text-status-working" />}
                      <div>
                        <p className="font-medium text-foreground">{alert.message}</p>
                        <p className="text-sm text-muted-foreground">
                          {alert.shift_name} - {new Date(alert.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        className={
                          alert.severity === "Error" ? "bg-destructive/20 text-destructive" :
                          alert.severity === "Warning" ? "bg-status-break/20 text-status-break" :
                          "bg-status-idle/20 text-status-idle"
                        }
                      >
                        {alert.severity}
                      </Badge>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-7 text-xs bg-transparent"
                        onClick={async () => {
                          await updateAlertStatus(alert.id, "Acknowledged")
                          mutateAlerts()
                        }}
                      >
                        Acknowledge
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Operator & Activity Card */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <User className="h-5 w-5" />
              Assigned Operator
            </CardTitle>
            <CardDescription>Current operator and today&apos;s activity</CardDescription>
          </CardHeader>
          <CardContent>
            {assignedOperator ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{assignedOperator}</p>
                      <p className="text-sm text-muted-foreground">
                        {currentPlan ? `Shift: ${currentPlan.shift_name || "Unknown"}` : "Expected operator"}
                      </p>
                    </div>
                  </div>
                  <Link href={`/operator/${encodeURIComponent(assignedOperator)}`}>
                    <Button variant="outline" size="sm" className="bg-transparent">
                      View Profile
                    </Button>
                  </Link>
                </div>
                
                {/* Activity Stats */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                  <div className="text-center p-3 rounded-lg bg-status-working/10">
                    <p className="text-2xl font-bold text-status-working">{Math.round(workingMinutes)}m</p>
                    <p className="text-xs text-muted-foreground">Working Today</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-status-break/10">
                    <p className="text-2xl font-bold text-status-break">{Math.round(breakMinutes)}m</p>
                    <p className="text-xs text-muted-foreground">Break/Idle</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No operator assigned</p>
                <p className="text-sm">Assign via Planning or set Expected Operator</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Camera Configuration Card */}
        {(station.camera_id || station.camera_stream_url) ? (
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Camera Configuration</CardTitle>
              <CardDescription>Live monitoring setup for this station</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-muted-foreground">Camera Name</Label>
                  <p className="text-foreground font-medium">{station.camera_name || "AI Camera"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Stream Mode</Label>
                  <p className="text-foreground font-medium uppercase">{station.camera_mode || "MJPEG"}</p>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Effective Stream URL</Label>
                <div className="flex gap-2 items-center mt-2">
                  <code className="flex-1 block p-2 bg-muted rounded text-xs text-foreground break-all">
                    {station.camera_stream_url || station.camera_stream_url_default || "Not configured"}
                  </code>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      const url = station.camera_stream_url || station.camera_stream_url_default
                      if (url) navigator.clipboard.writeText(url)
                    }}
                    className="bg-transparent"
                  >
                    Copy
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border bg-card border-dashed">
            <CardHeader>
              <CardTitle className="text-muted-foreground">No Camera Assigned</CardTitle>
              <CardDescription>Configure a camera to enable live monitoring</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Go to Stations page and edit this station to assign a camera.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Live Feed Display */}
        {(station.camera_stream_url || station.camera_stream_url_default) && (
          <Card className="border-border bg-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <Video className="h-5 w-5" />
                    Live Feed
                  </CardTitle>
                  <CardDescription>Real-time AI camera stream</CardDescription>
                </div>
                <Badge variant="secondary" className="gap-1 bg-status-working/20 text-status-working">
                  <div className="h-2 w-2 rounded-full bg-status-working animate-pulse" />
                  Live
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <LiveStreamViewer
                cameraName={station.name}
                streamUrl={station.camera_stream_url || station.camera_stream_url_default || ""}
                mode={station.camera_mode || "mjpeg"}
                cameraId={station.camera_id || undefined}
                isFullscreen={false}
                onFullscreenChange={setIsFullscreen}
              />
            </CardContent>
          </Card>
        )}

        {/* Camera Events / AI Detections */}
        {(station.camera_id || station.camera_stream_url) && (
          <Card className="border-border bg-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    AI Detections
                  </CardTitle>
                  <CardDescription>Recent activity detected by camera</CardDescription>
                </div>
                <Link href={`/events?camera=${station.camera_id}`}>
                  <Button variant="outline" size="sm" className="bg-transparent">
                    View All
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {cameraEvents && cameraEvents.length > 0 ? (
                <div className="space-y-2">
                  {cameraEvents.slice(0, 8).map((event, index) => (
                    <div key={index} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div className="flex items-center gap-3">
                        <div className={`h-2.5 w-2.5 rounded-full ${
                          event.activity_type === "Working" ? "bg-status-working" :
                          event.activity_type === "Break" ? "bg-status-break" :
                          event.activity_type === "Idle" ? "bg-status-idle" :
                          "bg-muted-foreground"
                        }`} />
                        <div>
                          <span className="font-medium text-foreground">{event.activity_type}</span>
                          {event.worker_name && (
                            <span className="text-muted-foreground ml-2">- {event.worker_name}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">
                          {new Date(event.event_time).toLocaleTimeString()}
                        </p>
                        {event.confidence !== undefined && (
                          <p className="text-xs text-muted-foreground">
                            {Math.round(event.confidence * 100)}% confidence
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No recent detections</p>
                  <p className="text-sm">Activity will appear here when detected</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Cycle Template Card */}
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-foreground">Cycle Template</CardTitle>
                <CardDescription>Define expected cycle steps and timing</CardDescription>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total Cycle Time</p>
                  <p className="text-2xl font-bold text-foreground">{totalCycleTime}s</p>
                </div>
                {currentTemplate && (
                  <Badge variant="secondary">
                    Tolerance: {currentTemplate.tolerance_percent}%
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Template Selector */}
            <div className="flex items-center gap-4">
              <div className="flex-1 max-w-sm">
                <Label htmlFor="template">Assigned Template</Label>
                <Select 
                  value={station.cycle_template_id?.toString() || ""} 
                  onValueChange={handleTemplateChange}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {templates?.map((template) => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.template_name} ({template.station_type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Cycle Steps Table */}
            {station.cycle_template_id && (
              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="w-12 text-muted-foreground">#</TableHead>
                      <TableHead className="text-muted-foreground">Step Name</TableHead>
                      <TableHead className="text-right text-muted-foreground">Expected (s)</TableHead>
                      <TableHead className="w-24 text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {steps?.map((step) => (
                      <TableRow key={step.id} className="border-border">
                        <TableCell className="text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                            {step.step_order}
                          </div>
                        </TableCell>
                        <TableCell>
                          {editingStepId === step.id ? (
                            <Input
                              defaultValue={step.step_name}
                              onBlur={(e) => handleUpdateStep(step, { step_name: e.target.value })}
                              className="h-8"
                              autoFocus
                            />
                          ) : (
                            <span className="text-foreground">{step.step_name}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {editingStepId === step.id ? (
                            <Input
                              type="number"
                              defaultValue={step.expected_seconds}
                              onBlur={(e) => handleUpdateStep(step, { expected_seconds: parseInt(e.target.value) })}
                              className="h-8 w-20 ml-auto text-right"
                            />
                          ) : (
                            <span className="font-mono text-foreground">{step.expected_seconds}s</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {editingStepId === step.id ? (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingStepId(null)}>
                                <X className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingStepId(step.id)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteStep(step.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}

                    {/* Add Step Row */}
                    {isAddingStep ? (
                      <TableRow className="border-border">
                        <TableCell className="text-muted-foreground">{(steps?.length || 0) + 1}</TableCell>
                        <TableCell>
                          <Input
                            placeholder="Step name"
                            value={newStepName}
                            onChange={(e) => setNewStepName(e.target.value)}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            placeholder="Seconds"
                            value={newStepSeconds}
                            onChange={(e) => setNewStepSeconds(e.target.value)}
                            className="h-8 w-20 ml-auto text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-status-working hover:text-status-working" onClick={handleAddStep}>
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsAddingStep(false)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow className="border-border">
                        <TableCell colSpan={4}>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="gap-2 w-full justify-center"
                            onClick={() => setIsAddingStep(true)}
                          >
                            <Plus className="h-4 w-4" />
                            Add Step
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {!station.cycle_template_id && (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border border-dashed border-border rounded-lg">
                <Clock className="h-8 w-8 mb-2" />
                <p>No cycle template assigned</p>
                <p className="text-sm">Select a template above to manage cycle steps</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
