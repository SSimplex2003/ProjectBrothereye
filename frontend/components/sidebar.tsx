"use client"

import { cn } from "@/lib/utils"
import { useTheme } from "@/components/theme-provider"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, History, Eye, LayoutDashboard, Factory, Calendar, Bell, Video, Moon, Sun, RotateCw, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/live", label: "Live Operators", icon: Activity },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/stations", label: "Stations", icon: Factory },
  { href: "/cameras", label: "AI Cameras", icon: Video },
  { href: "/planning", label: "Planning", icon: Calendar },
  { href: "/cycles", label: "Cycle Templates", icon: RotateCw },
  { href: "/history", label: "History & Summary", icon: History },
]

export function Sidebar() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Close sidebar when route changes on mobile
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  return (
    <>
      {/* Mobile Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Eye className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground">BrotherEye</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="h-9 w-9 p-0"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </header>

      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed left-0 top-0 z-50 h-screen w-64 border-r border-border bg-card transition-transform duration-300",
        "lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center gap-3 border-b border-border px-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Eye className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">BrotherEye</h1>
              <p className="text-xs text-muted-foreground">Operator Monitoring</p>
            </div>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-4">
            {navItems.map((item) => {
              const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </nav>
          <div className="space-y-3 border-t border-border p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Theme</span>
              {mounted && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="h-8 w-8 p-0 bg-transparent"
                >
                  {theme === 'dark' ? (
                    <Sun className="h-4 w-4 text-yellow-500" />
                  ) : (
                    <Moon className="h-4 w-4 text-slate-600" />
                  )}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-2 w-2 animate-pulse rounded-full bg-status-working" />
              <span>System Online</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
