"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import useSWR from "swr"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Plus, Pencil, X, GripVertical, Trash2, ChevronLeft, ChevronRight } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel"
import { WidgetRenderer } from "@/components/dashboard/widget-renderer"
import { WIDGET_REGISTRY, type WidgetDefinition } from "@/components/dashboard/widget-registry"
import {
  fetchDashboardWidgets,
  createDashboardWidget,
  updateDashboardWidget,
  deleteDashboardWidget,
  bulkReorderWidgets,
  type DashboardWidget,
  type WidgetType,
} from "@/lib/api"

export default function DashboardPage() {
  const [isEditMode, setIsEditMode] = useState(false)
  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false)
  const [carouselApi, setCarouselApi] = useState<CarouselApi>()
  const [currentPage, setCurrentPage] = useState(0)
  const [localWidgets, setLocalWidgets] = useState<DashboardWidget[]>([])

  const { data: widgets, error, mutate } = useSWR("dashboard-widgets", () => fetchDashboardWidgets("default"), {
    refreshInterval: isEditMode ? 0 : 30000, // Don't refresh during edit mode
  })

  // Sync local widgets with server data
  useEffect(() => {
    if (widgets && !isEditMode) {
      setLocalWidgets(widgets)
    }
  }, [widgets, isEditMode])

  // Track carousel page changes
  useEffect(() => {
    if (!carouselApi) return

    const onSelect = () => {
      setCurrentPage(carouselApi.selectedScrollSnap())
    }

    carouselApi.on("select", onSelect)
    onSelect()

    return () => {
      carouselApi.off("select", onSelect)
    }
  }, [carouselApi])

  // Group widgets by page_index
  const pages = useMemo(() => {
    const grouped: Record<number, DashboardWidget[]> = {}
    for (const widget of localWidgets) {
      const pageIdx = widget.page_index || 0
      if (!grouped[pageIdx]) grouped[pageIdx] = []
      grouped[pageIdx].push(widget)
    }
    // Sort widgets within each page by position
    for (const key of Object.keys(grouped)) {
      grouped[Number(key)].sort((a, b) => a.position - b.position)
    }
    // Convert to array of pages
    const maxPage = Math.max(0, ...Object.keys(grouped).map(Number))
    const result: DashboardWidget[][] = []
    for (let i = 0; i <= maxPage; i++) {
      result.push(grouped[i] || [])
    }
    // Always have at least one page
    if (result.length === 0) result.push([])
    return result
  }, [localWidgets])

  const totalPages = pages.length

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setLocalWidgets((prev) => {
      const currentPageWidgets = prev.filter(w => w.page_index === currentPage)
      const otherWidgets = prev.filter(w => w.page_index !== currentPage)
      
      const oldIndex = currentPageWidgets.findIndex(w => w.id === active.id)
      const newIndex = currentPageWidgets.findIndex(w => w.id === over.id)
      
      if (oldIndex === -1 || newIndex === -1) return prev

      const reordered = arrayMove(currentPageWidgets, oldIndex, newIndex)
      // Update positions
      const updated = reordered.map((w, idx) => ({ ...w, position: idx }))
      
      return [...otherWidgets, ...updated]
    })
  }, [currentPage])

  const handleAddWidget = async (type: WidgetType) => {
    try {
      const newWidget = await createDashboardWidget({
        user_id: "default",
        page_index: currentPage,
        position: pages[currentPage]?.length || 0,
        widget_type: type,
        config: WIDGET_REGISTRY[type].defaultConfig,
      })
      setLocalWidgets(prev => [...prev, newWidget])
      setIsAddWidgetOpen(false)
    } catch (err) {
      console.error("Failed to add widget:", err)
    }
  }

  const handleDeleteWidget = async (widgetId: number) => {
    try {
      await deleteDashboardWidget(widgetId)
      setLocalWidgets(prev => prev.filter(w => w.id !== widgetId))
    } catch (err) {
      console.error("Failed to delete widget:", err)
    }
  }

  const handleConfigChange = async (widgetId: number, config: Record<string, unknown>) => {
    try {
      await updateDashboardWidget(widgetId, { config })
      setLocalWidgets(prev => prev.map(w => w.id === widgetId ? { ...w, config } : w))
    } catch (err) {
      console.error("Failed to update widget config:", err)
    }
  }

  const handleAddPage = () => {
    // Add an empty page by creating a placeholder widget
    const newPageIndex = totalPages
    setLocalWidgets(prev => prev)
    // Navigate to the new page
    setTimeout(() => {
      carouselApi?.scrollTo(newPageIndex)
    }, 100)
  }

  const handleSaveChanges = async () => {
    try {
      // Save all widget positions
      const updates = localWidgets.map(w => ({
        id: w.id,
        page_index: w.page_index,
        position: w.position,
      }))
      await bulkReorderWidgets(updates)
      setIsEditMode(false)
      mutate()
    } catch (err) {
      console.error("Failed to save changes:", err)
    }
  }

  const handleCancelEdit = () => {
    setIsEditMode(false)
    if (widgets) {
      setLocalWidgets(widgets)
    }
  }

  const goToPage = (index: number) => {
    carouselApi?.scrollTo(index)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PageHeader
        title="Dashboard"
        description="Factory operations overview"
      >
        {isEditMode ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCancelEdit}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveChanges}>
              Save Changes
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setIsEditMode(true)} className="gap-2">
            <Pencil className="h-4 w-4" />
            Edit Dashboard
          </Button>
        )}
      </PageHeader>

      <div className="flex-1 flex flex-col p-4 md:p-8">
        {/* Carousel container */}
        <div className="flex-1 relative">
          <Carousel
            setApi={setCarouselApi}
            opts={{
              align: "start",
              loop: false,
            }}
            className="w-full h-full"
          >
            <CarouselContent className="h-full">
              {pages.map((pageWidgets, pageIndex) => (
                <CarouselItem key={pageIndex} className="h-full">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={pageWidgets.map(w => w.id)}
                      strategy={verticalListSortingStrategy}
                      disabled={!isEditMode}
                    >
                      <div className="space-y-4 pb-4">
                        {pageWidgets.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border-2 border-dashed border-border rounded-lg">
                            <p className="text-lg mb-2">Empty Page</p>
                            {isEditMode && (
                              <Button variant="outline" onClick={() => setIsAddWidgetOpen(true)} className="gap-2">
                                <Plus className="h-4 w-4" />
                                Add Widget
                              </Button>
                            )}
                          </div>
                        ) : (
                          pageWidgets.map((widget) => (
                            <SortableWidget
                              key={widget.id}
                              widget={widget}
                              isEditMode={isEditMode}
                              onDelete={() => handleDeleteWidget(widget.id)}
                              onConfigChange={handleConfigChange}
                            />
                          ))
                        )}
                        {isEditMode && pageWidgets.length > 0 && (
                          <Button
                            variant="outline"
                            className="w-full border-dashed gap-2"
                            onClick={() => setIsAddWidgetOpen(true)}
                          >
                            <Plus className="h-4 w-4" />
                            Add Widget
                          </Button>
                        )}
                      </div>
                    </SortableContext>
                  </DndContext>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          {/* Navigation arrows */}
          {totalPages > 1 && (
            <>
              <Button
                variant="outline"
                size="icon"
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 z-10 rounded-full bg-background shadow-md"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 z-10 rounded-full bg-background shadow-md"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        {/* Page indicators */}
        <div className="flex items-center justify-center gap-3 py-4">
          <div className="flex items-center gap-2">
            {pages.map((_, idx) => (
              <button
                key={idx}
                onClick={() => goToPage(idx)}
                className={`h-2.5 rounded-full transition-all ${
                  idx === currentPage
                    ? "w-8 bg-primary"
                    : "w-2.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
                aria-label={`Go to page ${idx + 1}`}
              />
            ))}
          </div>
          {isEditMode && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAddPage}
              className="gap-1 text-xs"
            >
              <Plus className="h-3 w-3" />
              Add Page
            </Button>
          )}
        </div>
      </div>

      {/* Add Widget Dialog */}
      <AddWidgetDialog
        open={isAddWidgetOpen}
        onOpenChange={setIsAddWidgetOpen}
        onAddWidget={handleAddWidget}
      />
    </div>
  )
}

function SortableWidget({
  widget,
  isEditMode,
  onDelete,
  onConfigChange,
}: {
  widget: DashboardWidget
  isEditMode: boolean
  onDelete: () => void
  onConfigChange: (widgetId: number, config: Record<string, unknown>) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id, disabled: !isEditMode })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative ${isDragging ? "z-50 opacity-80" : ""}`}
    >
      {isEditMode && (
        <div className="absolute -top-2 -right-2 z-10 flex items-center gap-1">
          <button
            {...attributes}
            {...listeners}
            className="p-1.5 rounded-full bg-muted border border-border hover:bg-muted/80 cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-full bg-destructive/10 border border-destructive/20 hover:bg-destructive/20 text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className={isEditMode ? "ring-2 ring-primary/20 rounded-lg" : ""}>
        <WidgetRenderer
          widget={widget}
          isEditMode={isEditMode}
          onConfigChange={onConfigChange}
        />
      </div>
    </div>
  )
}

function AddWidgetDialog({
  open,
  onOpenChange,
  onAddWidget,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddWidget: (type: WidgetType) => void
}) {
  const widgetTypes = Object.values(WIDGET_REGISTRY)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Add Widget</DialogTitle>
          <DialogDescription>Choose a widget to add to your dashboard</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 grid-cols-2 py-4">
          {widgetTypes.map((def) => (
            <button
              key={def.type}
              onClick={() => onAddWidget(def.type)}
              className="flex items-start gap-3 p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors text-left"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <def.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-foreground">{def.label}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{def.description}</p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
