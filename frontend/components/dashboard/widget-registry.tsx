"use client"

import { type WidgetType } from "@/lib/api"
import { BarChart3, Bell, Camera, Link, PieChart, Users } from "lucide-react"

export interface WidgetDefinition {
  type: WidgetType
  label: string
  description: string
  icon: typeof BarChart3
  defaultConfig: Record<string, unknown>
  minWidth?: number
  minHeight?: number
}

export const WIDGET_REGISTRY: Record<WidgetType, WidgetDefinition> = {
  stats: {
    type: "stats",
    label: "Stats Overview",
    description: "Active operators, stations, and alerts count",
    icon: BarChart3,
    defaultConfig: {},
  },
  quick_links: {
    type: "quick_links",
    label: "Quick Links",
    description: "Navigation shortcuts to main sections",
    icon: Link,
    defaultConfig: {},
  },
  camera_grid: {
    type: "camera_grid",
    label: "Camera Grid",
    description: "Live camera feeds in a grid",
    icon: Camera,
    defaultConfig: { cameraIds: [], columns: 2 },
  },
  operator_pie: {
    type: "operator_pie",
    label: "Operator Activity",
    description: "Pie chart of operator activity breakdown",
    icon: PieChart,
    defaultConfig: { operatorName: null },
  },
  alerts_list: {
    type: "alerts_list",
    label: "Alerts List",
    description: "Recent open alerts",
    icon: Bell,
    defaultConfig: { limit: 5 },
  },
  live_operators: {
    type: "live_operators",
    label: "Live Operators",
    description: "Currently active operators grid",
    icon: Users,
    defaultConfig: { limit: 6 },
  },
}

export function getWidgetDefinition(type: WidgetType): WidgetDefinition {
  return WIDGET_REGISTRY[type]
}
