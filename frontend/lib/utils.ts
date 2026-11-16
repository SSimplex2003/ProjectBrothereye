import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getElapsedTime(startTime: string): string {
  const start = new Date(startTime)
  const now = new Date()
  const diffMs = now.getTime() - start.getTime()

  if (diffMs < 0) return "0s"

  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

export function formatDuration(minutes: number): string {
  if (minutes === null || minutes === undefined || isNaN(minutes) || minutes <= 0) return "0m"
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  if (hours > 0) {
    return `${hours}h ${mins}m`
  }
  return `${mins}m`
}

export function formatDateTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function isStale(lastEventTime: string, thresholdMinutes = 5): boolean {
  const last = new Date(lastEventTime)
  const now = new Date()
  const diffMinutes = (now.getTime() - last.getTime()) / 1000 / 60
  return diffMinutes > thresholdMinutes
}

export function downloadCSV<T extends Record<string, unknown>>(data: T[], filename: string): void {
  if (data.length === 0) return

  const headers = Object.keys(data[0])
  const csvContent = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((header) => {
          const value = row[header]
          const str = String(value ?? "")
          return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str
        })
        .join(","),
    ),
  ].join("\n")

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}
