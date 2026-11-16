import { cn } from "@/lib/utils"

interface StatusBadgeProps {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase()

  const getStatusColor = () => {
    if (normalizedStatus.includes("working") || normalizedStatus.includes("active")) {
      return "bg-status-working/20 text-status-working border-status-working/30"
    }
    if (normalizedStatus.includes("break") || normalizedStatus.includes("pause")) {
      return "bg-status-break/20 text-status-break border-status-break/30"
    }
    if (normalizedStatus.includes("idle") || normalizedStatus.includes("away")) {
      return "bg-status-idle/20 text-status-idle border-status-idle/30"
    }
    if (normalizedStatus.includes("offline") || normalizedStatus.includes("disconnected")) {
      return "bg-status-offline/20 text-status-offline border-status-offline/30"
    }
    return "bg-muted text-muted-foreground border-muted"
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        getStatusColor(),
        className,
      )}
    >
      {status}
    </span>
  )
}
