const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001"

// =====================
// EXISTING TYPES
// =====================

export interface WorkerCurrentState {
  worker_name: string
  current_activity: string
  session_start_time: string
  last_event_time: string
}

export interface ActivityLog {
  id: number
  worker_name: string
  activity_type: string
  start_time: string
  end_time: string | null
  duration_seconds: number
  duration_minutes: number
}

export interface ActivitySummary {
  worker_name: string
  activity_type: string
  total_seconds: number
  total_minutes: number
}

// =====================
// NEW TYPES
// =====================

export interface Camera {
  id: number
  name: string
  location: string | null
  stream_url: string
  mode: "mjpeg" | "hls" | "webrtc" | "rtsp"
  notes: string | null
  created_at: string
}

export interface Station {
  id: number
  name: string
  station_type: string
  has_robot: boolean
  is_active: boolean
  notes: string | null
  cycle_template_id: number | null
  template_name?: string
  tolerance_percent?: number
  expected_cycle_seconds?: number
  camera_id: number | null
  camera_mode: "mjpeg" | "hls" | "webrtc" | "rtsp"
  camera_stream_url: string | null
  expected_operator_name: string | null
  camera_name?: string
  camera_stream_url_effective?: string
  camera_stream_url_default?: string
  show_stream: boolean
}

export interface Shift {
  id: number
  shift_name: string
  start_time: string
  end_time: string
}

export interface StationPlan {
  id: number
  plan_date: string
  shift_id: number
  station_id: number
  worker_name: string | null
  station_name?: string
  station_type?: string
  shift_name?: string
  shift_start?: string
  shift_end?: string
}

export interface PlanningImportRow {
  date: string
  operator_name: string
  shift_start_time: string
  lunch_break: string
  shift_end_time: string
  station_name: string
  shift_number: number
}

export interface CycleTemplate {
  id: number
  station_type: string
  template_name: string
  tolerance_percent: number
  total_expected_seconds?: number
}

export interface CycleStep {
  id: number
  template_id: number
  step_name: string
  expected_seconds: number
  step_order: number
}

export interface Alert {
  id: number
  plan_date: string
  station_id: number
  shift_id: number
  worker_name: string | null
  alert_type: string
  severity: string
  message: string
  status: "Open" | "Acknowledged" | "Resolved"
  created_at: string
  updated_at: string
  station_name?: string
  shift_name?: string
}

export interface StationMetric {
  station_id: number
  station_name: string
  station_type: string
  shift_id: number | null
  shift_name: string | null
  worker_name: string | null
  expected_cycle_seconds: number
  tolerance_percent: number
  work_minutes: number
  break_minutes: number
  estimated_cycles: number
  avg_cycle_seconds: number
  open_alerts_count: number
}

// =====================
// EXISTING FETCHERS
// =====================

export async function fetchWorkers(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/workers`)
  if (!res.ok) throw new Error("Failed to fetch workers")
  return res.json()
}

export async function fetchCurrentWorkers(): Promise<WorkerCurrentState[]> {
  const res = await fetch(`${API_BASE}/api/workers/current`)
  if (!res.ok) throw new Error("Failed to fetch current workers")
  return res.json()
}

export async function fetchActivity(
  workerName: string, 
  startDate: string, 
  endDate?: string
): Promise<ActivityLog[]> {
  const params = new URLSearchParams({ worker_name: workerName })
  if (endDate && endDate !== startDate) {
    params.append("start_date", startDate)
    params.append("end_date", endDate)
  } else {
    params.append("date", startDate)
  }
  const res = await fetch(`${API_BASE}/api/activity?${params.toString()}`)
  if (!res.ok) throw new Error("Failed to fetch activity")
  return res.json()
}

export async function fetchSummary(startDate: string, endDate?: string): Promise<ActivitySummary[]> {
  const params = new URLSearchParams()
  if (endDate && endDate !== startDate) {
    params.append("start_date", startDate)
    params.append("end_date", endDate)
  } else {
    params.append("date", startDate)
  }
  const res = await fetch(`${API_BASE}/api/summary?${params.toString()}`)
  if (!res.ok) throw new Error("Failed to fetch summary")
  return res.json()
}

// =====================
// CAMERAS FETCHERS
// =====================

export async function fetchCameras(): Promise<Camera[]> {
  const res = await fetch(`${API_BASE}/api/cameras`)
  if (!res.ok) throw new Error("Failed to fetch cameras")
  return res.json()
}

export async function fetchCamera(id: number): Promise<Camera> {
  const res = await fetch(`${API_BASE}/api/cameras/${id}`)
  if (!res.ok) throw new Error("Failed to fetch camera")
  return res.json()
}

export async function createCamera(camera: Omit<Camera, "id" | "created_at">): Promise<Camera> {
  const res = await fetch(`${API_BASE}/api/cameras`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(camera),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || "Failed to create camera")
  }
  return res.json()
}

export async function updateCamera(id: number, camera: Partial<Omit<Camera, "id" | "created_at">>): Promise<Camera> {
  const res = await fetch(`${API_BASE}/api/cameras/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(camera),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || "Failed to update camera")
  }
  return res.json()
}

export async function deleteCamera(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/cameras/${id}`, { method: "DELETE" })
  if (!res.ok) throw new Error("Failed to delete camera")
}

// =====================
// STATIONS FETCHERS
// =====================

export async function fetchStations(): Promise<Station[]> {
  const res = await fetch(`${API_BASE}/api/stations`)
  if (!res.ok) throw new Error("Failed to fetch stations")
  return res.json()
}

export async function fetchStation(id: number): Promise<Station> {
  const res = await fetch(`${API_BASE}/api/stations/${id}`)
  if (!res.ok) throw new Error("Failed to fetch station")
  return res.json()
}

export async function createStation(station: Omit<Station, "id">): Promise<Station> {
  const res = await fetch(`${API_BASE}/api/stations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(station),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || "Failed to create station")
  }
  return res.json()
}

export async function updateStation(id: number, station: Partial<Station>): Promise<Station> {
  const res = await fetch(`${API_BASE}/api/stations/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(station),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || "Failed to update station")
  }
  return res.json()
}

export async function deleteStation(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/stations/${id}`, { method: "DELETE" })
  if (!res.ok) throw new Error("Failed to delete station")
}

// =====================
// SHIFTS FETCHERS
// =====================

export async function fetchShifts(): Promise<Shift[]> {
  const res = await fetch(`${API_BASE}/api/shifts`)
  if (!res.ok) throw new Error("Failed to fetch shifts")
  return res.json()
}

export async function createShift(shift: Omit<Shift, "id">): Promise<Shift> {
  const res = await fetch(`${API_BASE}/api/shifts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(shift),
  })
  if (!res.ok) throw new Error("Failed to create shift")
  return res.json()
}

export async function updateShift(id: number, shift: Partial<Shift>): Promise<Shift> {
  const res = await fetch(`${API_BASE}/api/shifts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(shift),
  })
  if (!res.ok) throw new Error("Failed to update shift")
  return res.json()
}

export async function deleteShift(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/shifts/${id}`, { method: "DELETE" })
  if (!res.ok) throw new Error("Failed to delete shift")
}

// =====================
// PLANNING FETCHERS
// =====================

export async function fetchPlanning(date: string): Promise<StationPlan[]> {
  const res = await fetch(`${API_BASE}/api/planning?date=${date}`)
  if (!res.ok) throw new Error("Failed to fetch planning")
  return res.json()
}

export async function createOrUpdatePlanning(plan: Omit<StationPlan, "id">): Promise<StationPlan> {
  const res = await fetch(`${API_BASE}/api/planning`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plan),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || "Failed to save planning")
  }
  return res.json()
}

export async function deletePlanning(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/planning/${id}`, { method: "DELETE" })
  if (!res.ok) throw new Error("Failed to delete planning")
}

export interface BulkImportResult {
  success: boolean
  imported: number
  stations_created: number
  errors?: string[]
}

export async function bulkImportPlanning(rows: PlanningImportRow[]): Promise<BulkImportResult> {
  // Transform PlanningImportRow to the format expected by the backend
  const entries = rows.map(row => ({
    date: row.date,
    operator_name: row.operator_name,
    station_name: row.station_name,
    shift_number: row.shift_number
  }))
  
  const res = await fetch(`${API_BASE}/api/planning/bulk-import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries }),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || "Failed to import planning data")
  }
  return res.json()
}

// =====================
// CYCLE TEMPLATES FETCHERS
// =====================

export async function fetchCycleTemplates(stationType?: string): Promise<CycleTemplate[]> {
  const url = stationType 
    ? `${API_BASE}/api/cycle-templates?station_type=${encodeURIComponent(stationType)}`
    : `${API_BASE}/api/cycle-templates`
  const res = await fetch(url)
  if (!res.ok) throw new Error("Failed to fetch cycle templates")
  return res.json()
}

export async function createCycleTemplate(template: Omit<CycleTemplate, "id">): Promise<CycleTemplate> {
  const res = await fetch(`${API_BASE}/api/cycle-templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(template),
  })
  if (!res.ok) throw new Error("Failed to create cycle template")
  return res.json()
}

export async function updateCycleTemplate(id: number, template: Partial<CycleTemplate>): Promise<CycleTemplate> {
  const res = await fetch(`${API_BASE}/api/cycle-templates/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(template),
  })
  if (!res.ok) throw new Error("Failed to update cycle template")
  return res.json()
}

export async function deleteCycleTemplate(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/cycle-templates/${id}`, { method: "DELETE" })
  if (!res.ok) throw new Error("Failed to delete cycle template")
}

export async function fetchCycleSteps(templateId: number): Promise<CycleStep[]> {
  const res = await fetch(`${API_BASE}/api/cycle-templates/${templateId}/steps`)
  if (!res.ok) throw new Error("Failed to fetch cycle steps")
  return res.json()
}

export async function createCycleStep(templateId: number, step: Omit<CycleStep, "id" | "template_id">): Promise<CycleStep> {
  const res = await fetch(`${API_BASE}/api/cycle-templates/${templateId}/steps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(step),
  })
  if (!res.ok) throw new Error("Failed to create cycle step")
  return res.json()
}

export async function updateCycleStep(id: number, step: Partial<CycleStep>): Promise<CycleStep> {
  const res = await fetch(`${API_BASE}/api/cycle-steps/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(step),
  })
  if (!res.ok) throw new Error("Failed to update cycle step")
  return res.json()
}

export async function deleteCycleStep(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/cycle-steps/${id}`, { method: "DELETE" })
  if (!res.ok) throw new Error("Failed to delete cycle step")
}

// =====================
// ALERTS FETCHERS
// =====================

export async function fetchAlerts(date?: string, status?: string): Promise<Alert[]> {
  const params = new URLSearchParams()
  if (date) params.append("date", date)
  if (status) params.append("status", status)
  const url = `${API_BASE}/api/alerts${params.toString() ? `?${params.toString()}` : ""}`
  const res = await fetch(url)
  if (!res.ok) throw new Error("Failed to fetch alerts")
  return res.json()
}

export async function updateAlertStatus(id: number, status: "Open" | "Acknowledged" | "Resolved"): Promise<Alert> {
  const res = await fetch(`${API_BASE}/api/alerts/${id}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  })
  if (!res.ok) throw new Error("Failed to update alert status")
  return res.json()
}

export async function recomputeAlerts(date: string): Promise<{ success: boolean; alerts_created: number }> {
  const res = await fetch(`${API_BASE}/api/alerts/recompute?date=${date}`, {
    method: "POST",
  })
  if (!res.ok) throw new Error("Failed to recompute alerts")
  return res.json()
}

// =====================
// METRICS FETCHERS
// =====================

export async function fetchStationMetrics(date: string, shiftId?: number): Promise<StationMetric[]> {
  const params = new URLSearchParams({ date })
  if (shiftId) params.append("shift_id", shiftId.toString())
  const res = await fetch(`${API_BASE}/api/stations/metrics?${params.toString()}`)
  if (!res.ok) throw new Error("Failed to fetch station metrics")
  return res.json()
}

// =====================
// DASHBOARD WIDGETS
// =====================

export type WidgetType = "stats" | "quick_links" | "camera_grid" | "operator_pie" | "alerts_list" | "live_operators"

export interface DashboardWidget {
  id: number
  user_id: string
  page_index: number
  position: number
  widget_type: WidgetType
  config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export async function fetchDashboardWidgets(userId = "default"): Promise<DashboardWidget[]> {
  const res = await fetch(`${API_BASE}/api/dashboard/widgets?user_id=${encodeURIComponent(userId)}`)
  if (!res.ok) throw new Error("Failed to fetch dashboard widgets")
  return res.json()
}

export async function createDashboardWidget(widget: {
  user_id?: string
  page_index?: number
  position?: number
  widget_type: WidgetType
  config?: Record<string, unknown>
}): Promise<DashboardWidget> {
  const res = await fetch(`${API_BASE}/api/dashboard/widgets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(widget),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || "Failed to create widget")
  }
  return res.json()
}

export async function updateDashboardWidget(
  id: number,
  updates: Partial<Pick<DashboardWidget, "page_index" | "position" | "widget_type" | "config">>
): Promise<DashboardWidget> {
  const res = await fetch(`${API_BASE}/api/dashboard/widgets/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || "Failed to update widget")
  }
  return res.json()
}

export async function deleteDashboardWidget(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/dashboard/widgets/${id}`, { method: "DELETE" })
  if (!res.ok) throw new Error("Failed to delete widget")
}

export async function bulkReorderWidgets(
  widgets: Array<{ id: number; page_index: number; position: number }>
): Promise<{ success: boolean; updated: number }> {
  const res = await fetch(`${API_BASE}/api/dashboard/widgets/bulk-reorder`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ widgets }),
  })
  if (!res.ok) throw new Error("Failed to reorder widgets")
  return res.json()
}

// =====================
// CREATE MANUAL ALERT
// =====================

export async function createAlert(alert: {
  plan_date: string
  station_id?: number
  shift_id?: number
  worker_name?: string
  alert_type: string
  severity: "Info" | "Warning" | "Error"
  message: string
}): Promise<Alert> {
  const res = await fetch(`${API_BASE}/api/alerts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(alert),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || "Failed to create alert")
  }
  return res.json()
}

// =====================
// OPERATOR SCHEDULE
// =====================

export interface OperatorSchedule {
  worker_name: string
  date: string
  assignments: Array<{
    station_id: number
    station_name: string
    shift_id: number
    shift_name: string
    shift_start: string
    shift_end: string
  }>
}

export async function fetchOperatorSchedule(workerName: string, date: string): Promise<OperatorSchedule> {
  const res = await fetch(`${API_BASE}/api/workers/${encodeURIComponent(workerName)}/schedule?date=${date}`)
  if (!res.ok) throw new Error("Failed to fetch operator schedule")
  return res.json()
}

// =====================
// OPERATOR PERFORMANCE / CYCLE RECORDS
// =====================

export interface OperatorCycleRecord {
  worker_name: string
  station_id: number
  station_name: string
  best_cycle_seconds: number
  avg_cycle_seconds: number
  total_cycles: number
  last_cycle_date: string
}

export async function fetchOperatorCycleRecords(workerName: string): Promise<OperatorCycleRecord[]> {
  const res = await fetch(`${API_BASE}/api/workers/${encodeURIComponent(workerName)}/cycle-records`)
  if (!res.ok) throw new Error("Failed to fetch operator cycle records")
  return res.json()
}

// =====================
// COMPLIANCE CHECK - Get all station assignments and presence status
// =====================

export interface ComplianceStatus {
  station_id: number
  station_name: string
  shift_id: number
  shift_name: string
  assigned_worker: string | null
  detected_worker: string | null
  status: "compliant" | "missing" | "wrong_operator" | "unassigned" | "not_active"
  last_detection_time: string | null
}

export async function fetchComplianceStatus(date: string, shiftId?: number): Promise<ComplianceStatus[]> {
  const params = new URLSearchParams({ date })
  if (shiftId) params.append("shift_id", shiftId.toString())
  const res = await fetch(`${API_BASE}/api/planning/compliance?${params.toString()}`)
  if (!res.ok) throw new Error("Failed to fetch compliance status")
  return res.json()
}

// =====================
// OVERTIME TRACKING
// =====================

export interface OvertimeRecord {
  worker_name: string
  date: string
  shift_name: string
  shift_end: string
  last_activity_time: string
  overtime_minutes: number
}

export async function fetchOvertimeRecords(date: string): Promise<OvertimeRecord[]> {
  const res = await fetch(`${API_BASE}/api/workers/overtime?date=${date}`)
  if (!res.ok) throw new Error("Failed to fetch overtime records")
  return res.json()
}
