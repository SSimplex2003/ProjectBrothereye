"use client"

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"
import useSWR from "swr"
import { fetchAlerts, type Alert } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { AlertTriangle, UserX, Clock, Trophy, Coffee, Timer, Bell } from "lucide-react"

interface AlertNotificationContextValue {
  openAlerts: Alert[]
  criticalAlertCount: number
  lastChecked: Date | null
  markSeen: (alertId: number) => void
  seenAlertIds: Set<number>
}

const AlertNotificationContext = createContext<AlertNotificationContextValue | null>(null)

export function useAlertNotifications() {
  const context = useContext(AlertNotificationContext)
  if (!context) {
    throw new Error("useAlertNotifications must be used within AlertNotificationProvider")
  }
  return context
}

const ALERT_ICONS: Record<string, typeof AlertTriangle> = {
  OperatorNotPresent: UserX,
  MissingOperator: AlertTriangle,
  OperatorIdle: Coffee,
  OvertimeAlert: Clock,
  FastCycleRecord: Trophy,
  CycleTooSlow: Timer,
  DataStale: Clock,
  UnexpectedBreak: Coffee,
}

// Priority for critical alerts (should show toast)
const CRITICAL_ALERT_TYPES = [
  "OperatorNotPresent",
  "MissingOperator",
  "DataStale",
]

interface AlertNotificationProviderProps {
  children: ReactNode
  pollInterval?: number // milliseconds
}

export function AlertNotificationProvider({ 
  children, 
  pollInterval = 30000 // 30 seconds default
}: AlertNotificationProviderProps) {
  const { toast } = useToast()
  const [seenAlertIds, setSeenAlertIds] = useState<Set<number>>(new Set())
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  
  const today = new Date().toISOString().split("T")[0]
  
  const { data: alerts } = useSWR(
    `alerts-notifications-${today}`,
    () => fetchAlerts(today, "Open"),
    { 
      refreshInterval: pollInterval,
      revalidateOnFocus: true,
    }
  )
  
  const openAlerts = alerts || []
  const criticalAlertCount = openAlerts.filter(
    a => CRITICAL_ALERT_TYPES.includes(a.alert_type)
  ).length
  
  // Show toast for new critical alerts
  useEffect(() => {
    if (!alerts) return
    
    const newCriticalAlerts = alerts.filter(
      alert => 
        CRITICAL_ALERT_TYPES.includes(alert.alert_type) && 
        !seenAlertIds.has(alert.id)
    )
    
    // Show toast for each new critical alert (max 3 at a time)
    newCriticalAlerts.slice(0, 3).forEach(alert => {
      const Icon = ALERT_ICONS[alert.alert_type] || AlertTriangle
      
      toast({
        variant: "destructive",
        title: formatAlertTitle(alert.alert_type),
        description: alert.message,
      })
    })
    
    setLastChecked(new Date())
  }, [alerts, seenAlertIds, toast])
  
  const markSeen = useCallback((alertId: number) => {
    setSeenAlertIds(prev => new Set([...prev, alertId]))
  }, [])
  
  return (
    <AlertNotificationContext.Provider 
      value={{ 
        openAlerts, 
        criticalAlertCount, 
        lastChecked, 
        markSeen,
        seenAlertIds
      }}
    >
      {children}
    </AlertNotificationContext.Provider>
  )
}

function formatAlertTitle(alertType: string): string {
  switch (alertType) {
    case "OperatorNotPresent":
      return "Operator Not Present"
    case "MissingOperator":
      return "Missing Operator Assignment"
    case "OperatorIdle":
      return "Operator Idle"
    case "OvertimeAlert":
      return "Overtime Detected"
    case "FastCycleRecord":
      return "New Cycle Record!"
    case "CycleTooSlow":
      return "Slow Cycle Detected"
    case "DataStale":
      return "Data Connection Lost"
    case "UnexpectedBreak":
      return "Unexpected Break"
    default:
      return alertType.replace(/([A-Z])/g, " $1").trim()
  }
}

// Small badge component for showing alert count in navigation
export function AlertBadge({ className }: { className?: string }) {
  const { criticalAlertCount } = useAlertNotifications()
  
  if (criticalAlertCount === 0) return null
  
  return (
    <span 
      className={`
        inline-flex items-center justify-center 
        min-w-5 h-5 px-1.5 
        text-xs font-medium 
        bg-destructive text-destructive-foreground 
        rounded-full
        ${className || ""}
      `}
    >
      {criticalAlertCount > 99 ? "99+" : criticalAlertCount}
    </span>
  )
}
