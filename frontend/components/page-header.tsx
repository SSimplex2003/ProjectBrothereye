import type React from "react"
interface PageHeaderProps {
  title: string
  description?: string
  children?: React.ReactNode
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground truncate">{title}</h1>
        {description && <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-muted-foreground line-clamp-1">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-2 sm:gap-3 shrink-0">{children}</div>}
    </div>
  )
}
