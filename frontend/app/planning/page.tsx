"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import useSWR from "swr"
import { 
  Calendar, RefreshCw, AlertTriangle, ChevronLeft, ChevronRight, 
  User, Upload, FileSpreadsheet, Check, X, UserCheck, UserX, 
  Coffee, Clock, Bell, Zap, Eye, LayoutGrid, Users, Timer,
  AlertCircle, TrendingUp
} from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { 
  fetchStations, 
  fetchShifts, 
  fetchPlanning, 
  fetchWorkers,
  fetchCurrentWorkers,
  fetchAlerts,
  createOrUpdatePlanning,
  bulkImportPlanning,
  createAlert,
  recomputeAlerts,
  type Station, 
  type Shift, 
  type StationPlan,
  type PlanningImportRow,
  type WorkerCurrentState,
  type Alert
} from "@/lib/api"
import { isStale } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type ViewMode = "assignment" | "compliance"

interface ComplianceStats {
  totalAssignments: number
  operatorsPresent: number
  operatorsMissing: number
  operatorsIdle: number
  operatorsOnBreak: number
  operatorsOvertime: number
  unassignedStations: number
}

export default function PlanningPage() {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0])
  const [savingCell, setSavingCell] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [importPreview, setImportPreview] = useState<PlanningImportRow[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("assignment")
  const [isRecomputing, setIsRecomputing] = useState(false)
  const [alertDialogOpen, setAlertDialogOpen] = useState(false)
  const [alertTarget, setAlertTarget] = useState<{
    stationId: number
    stationName: string
    shiftId: number
    shiftName: string
    workerName: string | null
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: stations } = useSWR("stations", fetchStations)
  const { data: shifts } = useSWR("shifts", fetchShifts)
  const { data: workers } = useSWR("workers-list", fetchWorkers)
  const { data: currentWorkers, mutate: mutateWorkers } = useSWR("workers-current", fetchCurrentWorkers, { refreshInterval: 5000 })
  const { data: planning, mutate: mutatePlanning, isLoading } = useSWR(
    `planning-${selectedDate}`, 
    () => fetchPlanning(selectedDate)
  )
  const { data: todayAlerts, mutate: mutateAlerts } = useSWR(
    `alerts-planning-${selectedDate}`,
    () => fetchAlerts(selectedDate, "Open"),
    { refreshInterval: 30000 }
  )
  
  // Create a lookup for worker presence status
  const workerPresenceMap = useMemo(() => {
    const map: Record<string, { status: string; isActive: boolean; lastActivity: string; stationId?: number }> = {}
    currentWorkers?.forEach(w => {
      const isActive = !isStale(w.last_event_time)
      map[w.worker_name] = {
        status: w.current_activity || "Unknown",
        isActive,
        lastActivity: w.last_event_time
      }
    })
    return map
  }, [currentWorkers])
  
  // Check if today is the selected date (presence only matters for today)
  const isToday = selectedDate === new Date().toISOString().split("T")[0]
  
  // Get current shift based on time
  const currentShiftId = useMemo(() => {
    if (!isToday || !shifts) return null
    const now = new Date()
    const currentTime = now.toTimeString().slice(0, 5) // HH:MM
    
    for (const shift of shifts) {
      const start = shift.start_time.slice(0, 5)
      const end = shift.end_time.slice(0, 5)
      if (currentTime >= start && currentTime <= end) {
        return shift.id
      }
    }
    return null
  }, [isToday, shifts])

  // Calculate shift progress
  const shiftProgress = useMemo(() => {
    if (!currentShiftId || !shifts) return 0
    const currentShift = shifts.find(s => s.id === currentShiftId)
    if (!currentShift) return 0
    
    const now = new Date()
    const [startH, startM] = currentShift.start_time.split(":").map(Number)
    const [endH, endM] = currentShift.end_time.split(":").map(Number)
    
    const shiftStart = new Date(now)
    shiftStart.setHours(startH, startM, 0, 0)
    
    const shiftEnd = new Date(now)
    shiftEnd.setHours(endH, endM, 0, 0)
    
    const totalMinutes = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60)
    const elapsedMinutes = (now.getTime() - shiftStart.getTime()) / (1000 * 60)
    
    return Math.min(100, Math.max(0, (elapsedMinutes / totalMinutes) * 100))
  }, [currentShiftId, shifts])

  const activeStations = useMemo(() => {
    return stations?.filter(s => s.is_active) || []
  }, [stations])

  // Create a lookup map for planning entries
  const planningMap = useMemo(() => {
    const map: Record<string, StationPlan> = {}
    planning?.forEach(p => {
      map[`${p.station_id}-${p.shift_id}`] = p
    })
    return map
  }, [planning])

  // Find duplicate assignments
  const duplicateAssignments = useMemo(() => {
    const assignmentsPerShift: Record<number, Record<string, string[]>> = {}
    planning?.forEach(p => {
      if (p.worker_name) {
        if (!assignmentsPerShift[p.shift_id]) {
          assignmentsPerShift[p.shift_id] = {}
        }
        if (!assignmentsPerShift[p.shift_id][p.worker_name]) {
          assignmentsPerShift[p.shift_id][p.worker_name] = []
        }
        assignmentsPerShift[p.shift_id][p.worker_name].push(p.station_name || `Station ${p.station_id}`)
      }
    })
    
    const duplicates: Record<string, boolean> = {}
    Object.entries(assignmentsPerShift).forEach(([shiftId, workers]) => {
      Object.entries(workers).forEach(([workerName, stations]) => {
        if (stations.length > 1) {
          stations.forEach(stationName => {
            const stationObj = activeStations.find(s => s.name === stationName)
            if (stationObj) {
              duplicates[`${stationObj.id}-${shiftId}`] = true
            }
          })
        }
      })
    })
    return duplicates
  }, [planning, activeStations])

  // Compliance statistics
  const complianceStats = useMemo<ComplianceStats>(() => {
    if (!isToday || !planning || !currentShiftId) {
      return {
        totalAssignments: planning?.filter(p => p.shift_id === currentShiftId).length || 0,
        operatorsPresent: 0,
        operatorsMissing: 0,
        operatorsIdle: 0,
        operatorsOnBreak: 0,
        operatorsOvertime: 0,
        unassignedStations: 0
      }
    }

    const currentShiftPlans = planning.filter(p => p.shift_id === currentShiftId)
    let present = 0
    let missing = 0
    let idle = 0
    let onBreak = 0
    let unassigned = 0

    currentShiftPlans.forEach(plan => {
      if (!plan.worker_name) {
        unassigned++
        return
      }

      const presence = workerPresenceMap[plan.worker_name]
      if (!presence || !presence.isActive) {
        missing++
      } else {
        present++
        const activity = presence.status.toLowerCase()
        if (activity === "idle" || activity === "waiting") {
          idle++
        } else if (activity === "break" || activity === "pause") {
          onBreak++
        }
      }
    })

    // Count workers still active after shift should have ended
    const overtimeCount = Object.entries(workerPresenceMap).filter(([name, presence]) => {
      if (!presence.isActive) return false
      // Check if worker was assigned to an earlier shift
      const workerPlans = planning.filter(p => 
        p.worker_name === name && 
        p.shift_id !== currentShiftId
      )
      return workerPlans.length > 0
    }).length

    return {
      totalAssignments: currentShiftPlans.length,
      operatorsPresent: present,
      operatorsMissing: missing,
      operatorsIdle: idle,
      operatorsOnBreak: onBreak,
      operatorsOvertime: overtimeCount,
      unassignedStations: unassigned
    }
  }, [isToday, planning, currentShiftId, workerPresenceMap])

  // Alerts for the current view
  const relevantAlerts = useMemo(() => {
    if (!todayAlerts) return []
    return todayAlerts.filter(a => 
      a.alert_type === "OperatorNotPresent" ||
      a.alert_type === "MissingOperator" ||
      a.alert_type === "OperatorIdle" ||
      a.alert_type === "OvertimeAlert"
    )
  }, [todayAlerts])

  const handleAssignment = async (stationId: number, shiftId: number, workerName: string | null) => {
    const cellKey = `${stationId}-${shiftId}`
    setSavingCell(cellKey)
    setError(null)
    
    try {
      await createOrUpdatePlanning({
        plan_date: selectedDate,
        shift_id: shiftId,
        station_id: stationId,
        worker_name: workerName || null
      })
      mutatePlanning()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save assignment")
    } finally {
      setSavingCell(null)
    }
  }

  const handleRecompute = async () => {
    setIsRecomputing(true)
    try {
      await recomputeAlerts(selectedDate)
      mutateAlerts()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to recompute alerts")
    } finally {
      setIsRecomputing(false)
    }
  }

  const openAlertDialog = (stationId: number, stationName: string, shiftId: number, shiftName: string, workerName: string | null) => {
    setAlertTarget({ stationId, stationName, shiftId, shiftName, workerName })
    setAlertDialogOpen(true)
  }

  const handleCreateAlert = async (alertType: string, severity: "Info" | "Warning" | "Error", message: string) => {
    if (!alertTarget) return
    
    try {
      await createAlert({
        plan_date: selectedDate,
        station_id: alertTarget.stationId,
        shift_id: alertTarget.shiftId,
        worker_name: alertTarget.workerName || undefined,
        alert_type: alertType,
        severity,
        message
      })
      mutateAlerts()
      setAlertDialogOpen(false)
      setAlertTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create alert")
    }
  }

  const navigateDate = (days: number) => {
    const date = new Date(selectedDate)
    date.setDate(date.getDate() + days)
    setSelectedDate(date.toISOString().split("T")[0])
  }

  const formatShiftTime = (time: string) => {
    return time.substring(0, 5)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const rows = parseCSV(text)
      setImportPreview(rows)
      setIsImportDialogOpen(true)
      setImportSuccess(null)
    }
    reader.readAsText(file)
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const parseCSV = (text: string): PlanningImportRow[] => {
    const lines = text.trim().split('\n')
    if (lines.length < 2) return []
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    const rows: PlanningImportRow[] = []
    
    const dateIdx = headers.findIndex(h => h === 'date' || h.includes('date'))
    const operatorIdx = headers.findIndex(h => h === 'operator name' || h.includes('operator'))
    const shiftStartIdx = headers.findIndex(h => h === 'shift start time' || h.includes('start'))
    const lunchIdx = headers.findIndex(h => h === 'lunch break' || h.includes('lunch'))
    const shiftEndIdx = headers.findIndex(h => h === 'shift end time' || h.includes('end'))
    const stationIdx = headers.findIndex(h => h === 'station' || (h.includes('station') && !h.includes('shift')))
    const shiftNumIdx = headers.findIndex(h => h === 'shift number' || h.includes('shift num'))
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      
      const values = line.split(',').map(v => v.trim())
      if (values.length < 6) continue
      
      if (dateIdx >= 0 && operatorIdx >= 0 && stationIdx >= 0) {
        rows.push({
          date: values[dateIdx] || '',
          operator_name: values[operatorIdx] || '',
          shift_start_time: shiftStartIdx >= 0 ? values[shiftStartIdx] || '' : '',
          lunch_break: lunchIdx >= 0 ? values[lunchIdx] || '' : '',
          shift_end_time: shiftEndIdx >= 0 ? values[shiftEndIdx] || '' : '',
          station_name: values[stationIdx] || '',
          shift_number: shiftNumIdx >= 0 ? (parseInt(values[shiftNumIdx]) || 1) : 1
        })
      }
    }
    
    return rows
  }

  const handleImport = async () => {
    if (importPreview.length === 0) return
    
    setIsImporting(true)
    setError(null)
    
    try {
      const result = await bulkImportPlanning(importPreview)
      
      let message = `Successfully imported ${result.imported} schedule entries`
      if (result.stations_created > 0) {
        message += ` (${result.stations_created} new stations created)`
      }
      if (result.errors && result.errors.length > 0) {
        message += ` (${result.errors.length} skipped)`
      }
      
      setImportSuccess(message)
      setImportPreview([])
      
      mutatePlanning()
      
      setTimeout(() => {
        setIsImportDialogOpen(false)
        setImportSuccess(null)
        window.location.reload()
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import schedule')
    } finally {
      setIsImporting(false)
    }
  }

  const importSummary = useMemo(() => {
    if (importPreview.length === 0) return null
    
    const dates = new Set(importPreview.map(r => r.date))
    const operators = new Set(importPreview.map(r => r.operator_name))
    const stationsSet = new Set(importPreview.map(r => r.station_name))
    
    return {
      totalEntries: importPreview.length,
      dateRange: {
        start: [...dates].sort()[0],
        end: [...dates].sort().pop()
      },
      operatorCount: operators.size,
      stationCount: stationsSet.size,
      operators: [...operators],
      stations: [...stationsSet]
    }
  }, [importPreview])

  // Get presence status for a cell
  const getPresenceStatus = (plan: StationPlan | undefined, shiftId: number) => {
    if (!plan?.worker_name || !isToday || shiftId !== currentShiftId) {
      return null
    }
    
    const presence = workerPresenceMap[plan.worker_name]
    if (!presence) {
      return { status: "not_detected", color: "text-destructive", icon: UserX, tooltip: "Operator not detected" }
    }
    
    if (!presence.isActive) {
      return { 
        status: "stale", 
        color: "text-destructive", 
        icon: UserX, 
        tooltip: `Not detected - Last seen ${presence.lastActivity ? new Date(presence.lastActivity).toLocaleTimeString() : "never"}` 
      }
    }
    
    const activity = presence.status.toLowerCase()
    if (activity === "working" || activity === "active") {
      return { status: "working", color: "text-status-working", icon: UserCheck, tooltip: `Working - Active` }
    } else if (activity === "break" || activity === "pause") {
      return { status: "break", color: "text-status-break", icon: Coffee, tooltip: `On break` }
    } else if (activity === "idle" || activity === "waiting") {
      return { status: "idle", color: "text-status-idle", icon: Clock, tooltip: `Idle - No activity` }
    }
    
    return { status: "active", color: "text-status-working", icon: UserCheck, tooltip: presence.status }
  }

  const currentShift = shifts?.find(s => s.id === currentShiftId)

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Shift Planning" description="Assign operators to stations and monitor compliance">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => fileInputRef.current?.click()} 
          className="gap-2 bg-transparent"
        >
          <Upload className="h-4 w-4" />
          Import CSV
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRecompute} 
          disabled={isRecomputing}
          className="gap-2 bg-transparent"
        >
          {isRecomputing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Check Alerts
        </Button>
        <Button variant="outline" size="sm" onClick={() => mutatePlanning()} className="gap-2 bg-transparent">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </PageHeader>

      <div className="p-8">
        {/* Quick Stats - Only show for today */}
        {isToday && currentShiftId && (
          <div className="grid gap-4 md:grid-cols-6 mb-6">
            <Card className="border-border bg-card">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-status-working" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">{complianceStats.operatorsPresent}</p>
                    <p className="text-xs text-muted-foreground">Present</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <UserX className="h-4 w-4 text-destructive" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">{complianceStats.operatorsMissing}</p>
                    <p className="text-xs text-muted-foreground">Missing</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-status-idle" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">{complianceStats.operatorsIdle}</p>
                    <p className="text-xs text-muted-foreground">Idle</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Coffee className="h-4 w-4 text-status-break" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">{complianceStats.operatorsOnBreak}</p>
                    <p className="text-xs text-muted-foreground">On Break</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Timer className="h-4 w-4 text-status-break" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">{complianceStats.operatorsOvertime}</p>
                    <p className="text-xs text-muted-foreground">Overtime</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-destructive" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">{relevantAlerts.length}</p>
                    <p className="text-xs text-muted-foreground">Open Alerts</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Current Shift Progress */}
        {isToday && currentShift && (
          <Card className="border-border bg-card mb-6">
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="font-medium text-foreground">Current: {currentShift.shift_name}</span>
                  <span className="text-muted-foreground text-sm">
                    ({formatShiftTime(currentShift.start_time)} - {formatShiftTime(currentShift.end_time)})
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">{Math.round(shiftProgress)}% complete</span>
              </div>
              <Progress value={shiftProgress} className="h-2" />
            </CardContent>
          </Card>
        )}

        {/* Date Navigation */}
        <Card className="border-border bg-card mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => navigateDate(-1)} className="gap-2 bg-transparent">
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <div className="flex items-center gap-4">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-48 bg-card border-border"
                />
                <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])} className="bg-transparent">
                  Today
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigateDate(1)} className="gap-2 bg-transparent">
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* View Mode Tabs */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} className="mb-6">
          <TabsList>
            <TabsTrigger value="assignment" className="gap-2">
              <LayoutGrid className="h-4 w-4" />
              Assignment View
            </TabsTrigger>
            <TabsTrigger value="compliance" className="gap-2">
              <Eye className="h-4 w-4" />
              Compliance View
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Planning Grid */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">
              {new Date(selectedDate).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </CardTitle>
            <CardDescription>
              {activeStations.length} active stations, {shifts?.length || 0} shifts
              {viewMode === "compliance" && isToday && " - Real-time compliance monitoring"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : activeStations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <p>No active stations found</p>
                <p className="text-sm">Create stations first or import a CSV schedule</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground min-w-[200px]">Station</TableHead>
                      {shifts?.map((shift) => (
                        <TableHead 
                          key={shift.id} 
                          className={`text-muted-foreground text-center min-w-[220px] ${shift.id === currentShiftId ? "bg-primary/10" : ""}`}
                        >
                          <div className={shift.id === currentShiftId ? "text-primary font-semibold" : ""}>
                            {shift.shift_name}
                            {shift.id === currentShiftId && " (Active)"}
                          </div>
                          <div className="text-xs font-normal">
                            {formatShiftTime(shift.start_time)} - {formatShiftTime(shift.end_time)}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeStations.map((station) => (
                      <TableRow key={station.id} className="border-border">
                        <TableCell className="font-medium">
                          <div className="text-foreground">{station.name}</div>
                          <div className="text-xs text-muted-foreground">{station.station_type}</div>
                        </TableCell>
                        {shifts?.map((shift) => {
                          const cellKey = `${station.id}-${shift.id}`
                          const plan = planningMap[cellKey]
                          const isDuplicate = duplicateAssignments[cellKey]
                          const isSaving = savingCell === cellKey
                          const presenceStatus = getPresenceStatus(plan, shift.id)
                          const isCurrentShift = shift.id === currentShiftId
                          
                          // Check if there's an alert for this cell
                          const cellAlert = relevantAlerts.find(a => 
                            a.station_id === station.id && 
                            a.shift_id === shift.id
                          )
                          
                          return (
                            <TableCell 
                              key={shift.id} 
                              className={`text-center ${isCurrentShift ? "bg-primary/5" : ""}`}
                            >
                              <div className="relative">
                                {viewMode === "compliance" && isToday && isCurrentShift ? (
                                  // Compliance View - Shows status prominently
                                  <div 
                                    className={`
                                      p-3 rounded-lg border-2 transition-colors
                                      ${!plan?.worker_name 
                                        ? "border-muted bg-muted/20" 
                                        : presenceStatus?.status === "working" || presenceStatus?.status === "active"
                                          ? "border-status-working/50 bg-status-working/10"
                                          : presenceStatus?.status === "break"
                                            ? "border-status-break/50 bg-status-break/10"
                                            : presenceStatus?.status === "idle"
                                              ? "border-status-idle/50 bg-status-idle/10"
                                              : "border-destructive/50 bg-destructive/10"
                                      }
                                    `}
                                  >
                                    {plan?.worker_name ? (
                                      <div className="flex flex-col items-center gap-2">
                                        {presenceStatus && (
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger>
                                                <presenceStatus.icon className={`h-6 w-6 ${presenceStatus.color}`} />
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <p>{presenceStatus.tooltip}</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        )}
                                        <span className="font-medium text-foreground">{plan.worker_name}</span>
                                        {cellAlert && (
                                          <Badge variant="destructive" className="text-xs">
                                            <AlertCircle className="h-3 w-3 mr-1" />
                                            {cellAlert.alert_type}
                                          </Badge>
                                        )}
                                        {(presenceStatus?.status === "not_detected" || presenceStatus?.status === "stale") && !cellAlert && (
                                          <Button 
                                            size="sm" 
                                            variant="destructive"
                                            className="h-6 text-xs"
                                            onClick={() => openAlertDialog(station.id, station.name, shift.id, shift.shift_name, plan.worker_name)}
                                          >
                                            <Bell className="h-3 w-3 mr-1" />
                                            Create Alert
                                          </Button>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                        <User className="h-6 w-6" />
                                        <span className="text-sm">Unassigned</span>
                                        <Button 
                                          size="sm" 
                                          variant="outline"
                                          className="h-6 text-xs"
                                          onClick={() => openAlertDialog(station.id, station.name, shift.id, shift.shift_name, null)}
                                        >
                                          <Bell className="h-3 w-3 mr-1" />
                                          Flag Issue
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  // Assignment View - Shows dropdown
                                  <>
                                    <Select
                                      value={plan?.worker_name || ""}
                                      onValueChange={(value) => handleAssignment(station.id, shift.id, value === "unassigned" ? null : value)}
                                      disabled={isSaving}
                                    >
                                      <SelectTrigger 
                                        className={`
                                          w-full 
                                          ${isDuplicate ? "border-status-break" : ""} 
                                          ${isToday && isCurrentShift && presenceStatus && (presenceStatus.status === "not_detected" || presenceStatus.status === "stale") ? "border-destructive" : ""}
                                        `}
                                      >
                                        <SelectValue placeholder="Unassigned">
                                          {plan?.worker_name ? (
                                            <div className="flex items-center gap-2">
                                              {isToday && isCurrentShift && presenceStatus ? (
                                                <TooltipProvider>
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <span className={presenceStatus.color}>
                                                        <presenceStatus.icon className="h-3 w-3" />
                                                      </span>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                      <p>{presenceStatus.tooltip}</p>
                                                    </TooltipContent>
                                                  </Tooltip>
                                                </TooltipProvider>
                                              ) : (
                                                <User className="h-3 w-3" />
                                              )}
                                              {plan.worker_name}
                                            </div>
                                          ) : (
                                            <span className="text-muted-foreground">Unassigned</span>
                                          )}
                                        </SelectValue>
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="unassigned">
                                          <span className="text-muted-foreground">Unassigned</span>
                                        </SelectItem>
                                        {workers?.map((worker) => {
                                          const workerPresence = workerPresenceMap[worker]
                                          return (
                                            <SelectItem key={worker} value={worker}>
                                              <div className="flex items-center gap-2">
                                                {workerPresence?.isActive ? (
                                                  <div className="h-2 w-2 rounded-full bg-status-working" />
                                                ) : (
                                                  <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                                                )}
                                                {worker}
                                              </div>
                                            </SelectItem>
                                          )
                                        })}
                                      </SelectContent>
                                    </Select>
                                    {isDuplicate && (
                                      <Badge variant="destructive" className="absolute -top-2 -right-2 text-xs px-1">
                                        <AlertTriangle className="h-3 w-3" />
                                      </Badge>
                                    )}
                                    {isSaving && (
                                      <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                                        <RefreshCw className="h-4 w-4 animate-spin" />
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Legend */}
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded border-2 border-status-break" />
                <span>Duplicate assignment</span>
              </div>
              {isToday && (
                <>
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-status-working" />
                    <span>Working</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Coffee className="h-4 w-4 text-status-break" />
                    <span>On break</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-status-idle" />
                    <span>Idle</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <UserX className="h-4 w-4 text-destructive" />
                    <span>Not present</span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Active Alerts Section */}
        {isToday && relevantAlerts.length > 0 && (
          <Card className="border-border bg-card mt-6">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Bell className="h-5 w-5 text-destructive" />
                Active Planning Alerts
              </CardTitle>
              <CardDescription>{relevantAlerts.length} open alerts for today</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {relevantAlerts.slice(0, 5).map(alert => (
                  <div 
                    key={alert.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30"
                  >
                    <div className="flex items-center gap-3">
                      {alert.alert_type === "OperatorNotPresent" && <UserX className="h-5 w-5 text-destructive" />}
                      {alert.alert_type === "MissingOperator" && <AlertTriangle className="h-5 w-5 text-status-break" />}
                      {alert.alert_type === "OperatorIdle" && <Coffee className="h-5 w-5 text-status-idle" />}
                      {alert.alert_type === "OvertimeAlert" && <Clock className="h-5 w-5 text-status-idle" />}
                      <div>
                        <p className="font-medium text-foreground">{alert.message}</p>
                        <p className="text-sm text-muted-foreground">
                          {alert.station_name} - {alert.shift_name}
                          {alert.worker_name && ` - ${alert.worker_name}`}
                        </p>
                      </div>
                    </div>
                    <Badge 
                      className={
                        alert.severity === "Error" ? "bg-destructive/20 text-destructive" :
                        alert.severity === "Warning" ? "bg-status-break/20 text-status-break" :
                        "bg-status-idle/20 text-status-idle"
                      }
                    >
                      {alert.severity}
                    </Badge>
                  </div>
                ))}
                {relevantAlerts.length > 5 && (
                  <p className="text-sm text-muted-foreground text-center">
                    And {relevantAlerts.length - 5} more alerts...
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Import CSV Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Import Monthly Schedule
            </DialogTitle>
            <DialogDescription>
              Review and confirm the schedule data from your CSV file.
              Missing stations will be automatically created.
            </DialogDescription>
          </DialogHeader>

          {importSuccess ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="h-12 w-12 rounded-full bg-status-working/20 flex items-center justify-center">
                <Check className="h-6 w-6 text-status-working" />
              </div>
              <p className="text-status-working font-medium">{importSuccess}</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  {error}
                </div>
              )}

              {importSummary && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="border-border bg-muted/30">
                      <CardContent className="pt-4">
                        <p className="text-2xl font-bold text-foreground">{importSummary.totalEntries}</p>
                        <p className="text-sm text-muted-foreground">Schedule Entries</p>
                      </CardContent>
                    </Card>
                    <Card className="border-border bg-muted/30">
                      <CardContent className="pt-4">
                        <p className="text-sm font-medium text-foreground">
                          {importSummary.dateRange.start} to {importSummary.dateRange.end}
                        </p>
                        <p className="text-sm text-muted-foreground">Date Range</p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground mb-2">
                        Operators ({importSummary.operatorCount})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {importSummary.operators.slice(0, 10).map(op => (
                          <Badge key={op} variant="secondary" className="text-xs">
                            {op}
                          </Badge>
                        ))}
                        {importSummary.operatorCount > 10 && (
                          <Badge variant="outline" className="text-xs">
                            +{importSummary.operatorCount - 10} more
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground mb-2">
                        Stations ({importSummary.stationCount})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {importSummary.stations.slice(0, 10).map(st => (
                          <Badge key={st} variant="secondary" className="text-xs">
                            {st}
                          </Badge>
                        ))}
                        {importSummary.stationCount > 10 && (
                          <Badge variant="outline" className="text-xs">
                            +{importSummary.stationCount - 10} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border border-border rounded-lg max-h-48 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border">
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Operator</TableHead>
                          <TableHead className="text-xs">Station</TableHead>
                          <TableHead className="text-xs">Shift</TableHead>
                          <TableHead className="text-xs">Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importPreview.slice(0, 10).map((row, idx) => (
                          <TableRow key={idx} className="border-border">
                            <TableCell className="text-xs py-2">{row.date}</TableCell>
                            <TableCell className="text-xs py-2">{row.operator_name}</TableCell>
                            <TableCell className="text-xs py-2">{row.station_name}</TableCell>
                            <TableCell className="text-xs py-2">Shift {row.shift_number}</TableCell>
                            <TableCell className="text-xs py-2">
                              {row.shift_start_time} - {row.shift_end_time}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {importPreview.length > 10 && (
                      <div className="p-2 text-center text-xs text-muted-foreground border-t border-border">
                        ... and {importPreview.length - 10} more entries
                      </div>
                    )}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsImportDialogOpen(false)
                    setImportPreview([])
                    setError(null)
                  }}
                  className="bg-transparent"
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button 
                  onClick={handleImport} 
                  disabled={isImporting || importPreview.length === 0}
                >
                  {isImporting ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Import {importPreview.length} Entries
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Alert Dialog */}
      <Dialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Create Alert
            </DialogTitle>
            <DialogDescription>
              Create an alert for {alertTarget?.stationName} - {alertTarget?.shiftName}
              {alertTarget?.workerName && ` (${alertTarget.workerName})`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <Button 
              variant="outline" 
              className="justify-start gap-3 h-auto py-3"
              onClick={() => handleCreateAlert(
                "OperatorNotPresent", 
                "Error", 
                `Operator ${alertTarget?.workerName || "unknown"} not detected at ${alertTarget?.stationName}`
              )}
            >
              <UserX className="h-5 w-5 text-destructive" />
              <div className="text-left">
                <p className="font-medium">Operator Not Present</p>
                <p className="text-xs text-muted-foreground">Assigned operator not detected at station</p>
              </div>
            </Button>
            
            <Button 
              variant="outline" 
              className="justify-start gap-3 h-auto py-3"
              onClick={() => handleCreateAlert(
                "OperatorIdle", 
                "Warning", 
                `Operator ${alertTarget?.workerName || "unknown"} idle at ${alertTarget?.stationName}`
              )}
            >
              <Coffee className="h-5 w-5 text-status-idle" />
              <div className="text-left">
                <p className="font-medium">Operator Idle</p>
                <p className="text-xs text-muted-foreground">Operator present but not working</p>
              </div>
            </Button>
            
            <Button 
              variant="outline" 
              className="justify-start gap-3 h-auto py-3"
              onClick={() => handleCreateAlert(
                "MissingOperator", 
                "Warning", 
                `No operator assigned to ${alertTarget?.stationName} for ${alertTarget?.shiftName}`
              )}
            >
              <AlertTriangle className="h-5 w-5 text-status-break" />
              <div className="text-left">
                <p className="font-medium">Missing Assignment</p>
                <p className="text-xs text-muted-foreground">Station needs an operator assigned</p>
              </div>
            </Button>
            
            <Button 
              variant="outline" 
              className="justify-start gap-3 h-auto py-3"
              onClick={() => handleCreateAlert(
                "OvertimeAlert", 
                "Info", 
                `Operator ${alertTarget?.workerName || "unknown"} working overtime at ${alertTarget?.stationName}`
              )}
            >
              <Clock className="h-5 w-5 text-status-idle" />
              <div className="text-left">
                <p className="font-medium">Overtime Alert</p>
                <p className="text-xs text-muted-foreground">Operator working past shift end</p>
              </div>
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAlertDialogOpen(false)} className="bg-transparent">
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
