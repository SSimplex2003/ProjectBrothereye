"use client"

import { type DashboardWidget, type WidgetType } from "@/lib/api"
import { StatsWidget } from "./widgets/stats-widget"
import { QuickLinksWidget } from "./widgets/quick-links-widget"
import { LiveOperatorsWidget } from "./widgets/live-operators-widget"
import { AlertsListWidget } from "./widgets/alerts-list-widget"
import { CameraGridWidget } from "./widgets/camera-grid-widget"
import { OperatorPieWidget } from "./widgets/operator-pie-widget"

interface WidgetRendererProps {
  widget: DashboardWidget
  isEditMode?: boolean
  onConfigChange?: (widgetId: number, config: Record<string, unknown>) => void
}

export function WidgetRenderer({ widget, isEditMode, onConfigChange }: WidgetRendererProps) {
  const handleConfigChange = (config: Record<string, unknown>) => {
    onConfigChange?.(widget.id, config)
  }

  switch (widget.widget_type) {
    case "stats":
      return <StatsWidget />
    case "quick_links":
      return <QuickLinksWidget />
    case "live_operators":
      return (
        <LiveOperatorsWidget
          config={widget.config as { limit?: number }}
        />
      )
    case "alerts_list":
      return (
        <AlertsListWidget
          config={widget.config as { limit?: number }}
        />
      )
    case "camera_grid":
      return (
        <CameraGridWidget
          config={widget.config as { cameraIds?: number[]; columns?: number }}
          onConfigChange={handleConfigChange}
          isEditMode={isEditMode}
        />
      )
    case "operator_pie":
      return (
        <OperatorPieWidget
          config={widget.config as { operatorName?: string | null }}
          onConfigChange={handleConfigChange}
          isEditMode={isEditMode}
        />
      )
    default:
      return (
        <div className="p-4 border border-border rounded-lg bg-card">
          <p className="text-muted-foreground">Unknown widget type: {widget.widget_type}</p>
        </div>
      )
  }
}
