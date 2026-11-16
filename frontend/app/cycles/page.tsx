"use client"

import { useState } from "react"
import useSWR from "swr"
import { 
  Plus, RefreshCw, Trash2, Clock, Pencil, 
  RotateCw, ChevronRight, GripVertical, Save, Timer
} from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  fetchCycleTemplates, 
  fetchCycleSteps,
  createCycleTemplate,
  updateCycleTemplate,
  deleteCycleTemplate,
  createCycleStep,
  updateCycleStep,
  deleteCycleStep,
  type CycleTemplate,
  type CycleStep 
} from "@/lib/api"

const STATION_TYPES = ["Assembly", "Soldering", "Milling", "Packaging", "Inspection", "Other"]

interface StepData {
  id?: number
  step_name: string
  expected_seconds: number
  step_order: number
}

export default function CyclesPage() {
  const { data: templates, error, isLoading, mutate } = useSWR("cycle-templates", () => fetchCycleTemplates())
  
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<CycleTemplate | null>(null)
  const [editingSteps, setEditingSteps] = useState<StepData[]>([])
  const [deletingTemplate, setDeletingTemplate] = useState<CycleTemplate | null>(null)
  const [expandedTemplateId, setExpandedTemplateId] = useState<number | null>(null)
  const [formError, setFormError] = useState("")

  // Fetch steps for expanded template
  const { data: expandedSteps, mutate: mutateSteps } = useSWR(
    expandedTemplateId ? `steps-${expandedTemplateId}` : null,
    () => expandedTemplateId ? fetchCycleSteps(expandedTemplateId) : Promise.resolve([])
  )

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  }

  const openEditDialog = async (template: CycleTemplate) => {
    try {
      const steps = await fetchCycleSteps(template.id)
      setEditingSteps(steps.map(s => ({
        id: s.id,
        step_name: s.step_name,
        expected_seconds: s.expected_seconds,
        step_order: s.step_order
      })))
    } catch {
      setEditingSteps([])
    }
    setEditingTemplate(template)
  }

  const handleCreate = async (formData: FormData) => {
    try {
      setFormError("")
      const name = formData.get("name") as string
      const stationType = formData.get("station_type") as string
      const tolerance = parseInt(formData.get("tolerance") as string) || 10
      
      // Collect steps from form
      const steps: StepData[] = []
      let i = 0
      while (formData.has(`step_name_${i}`)) {
        const stepName = formData.get(`step_name_${i}`) as string
        const stepSeconds = parseInt(formData.get(`step_seconds_${i}`) as string) || 10
        if (stepName.trim()) {
          steps.push({
            step_name: stepName,
            expected_seconds: stepSeconds,
            step_order: i + 1
          })
        }
        i++
      }
      
      if (!name.trim()) {
        setFormError("Template name is required")
        return
      }
      if (steps.length === 0) {
        setFormError("At least one step is required")
        return
      }

      const template = await createCycleTemplate({
        template_name: name,
        station_type: stationType,
        tolerance_percent: tolerance
      })
      
      for (const step of steps) {
        await createCycleStep(template.id, {
          step_name: step.step_name,
          expected_seconds: step.expected_seconds,
          step_order: step.step_order
        })
      }
      
      setIsCreateOpen(false)
      mutate()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create template")
    }
  }

  const handleUpdate = async (formData: FormData) => {
    if (!editingTemplate) return
    try {
      setFormError("")
      const name = formData.get("name") as string
      const stationType = formData.get("station_type") as string
      const tolerance = parseInt(formData.get("tolerance") as string) || 10
      
      // Collect steps from form
      const steps: StepData[] = []
      let i = 0
      while (formData.has(`step_name_${i}`)) {
        const stepName = formData.get(`step_name_${i}`) as string
        const stepSeconds = parseInt(formData.get(`step_seconds_${i}`) as string) || 10
        const stepId = formData.get(`step_id_${i}`) as string
        if (stepName.trim()) {
          steps.push({
            id: stepId ? parseInt(stepId) : undefined,
            step_name: stepName,
            expected_seconds: stepSeconds,
            step_order: i + 1
          })
        }
        i++
      }
      
      if (!name.trim()) {
        setFormError("Template name is required")
        return
      }
      if (steps.length === 0) {
        setFormError("At least one step is required")
        return
      }
      
      await updateCycleTemplate(editingTemplate.id, {
        template_name: name,
        station_type: stationType,
        tolerance_percent: tolerance
      })
      
      // Handle step updates
      const existingSteps = await fetchCycleSteps(editingTemplate.id)
      const existingIds = existingSteps.map(s => s.id)
      const currentIds = steps.filter(s => s.id).map(s => s.id!)
      
      // Delete removed steps
      for (const existing of existingSteps) {
        if (!currentIds.includes(existing.id)) {
          await deleteCycleStep(existing.id)
        }
      }
      
      // Update or create steps
      for (const step of steps) {
        if (step.id && existingIds.includes(step.id)) {
          await updateCycleStep(step.id, {
            step_name: step.step_name,
            expected_seconds: step.expected_seconds,
            step_order: step.step_order
          })
        } else {
          await createCycleStep(editingTemplate.id, {
            step_name: step.step_name,
            expected_seconds: step.expected_seconds,
            step_order: step.step_order
          })
        }
      }
      
      setEditingTemplate(null)
      mutate()
      if (expandedTemplateId === editingTemplate.id) {
        mutateSteps()
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update template")
    }
  }

  const handleDelete = async () => {
    if (!deletingTemplate) return
    try {
      await deleteCycleTemplate(deletingTemplate.id)
      setDeletingTemplate(null)
      if (expandedTemplateId === deletingTemplate.id) {
        setExpandedTemplateId(null)
      }
      mutate()
    } catch (err) {
      console.error("Failed to delete template:", err)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Cycle Templates" description="Create and manage reusable cycle templates for stations">
        <Button variant="outline" size="sm" onClick={() => mutate()} className="gap-2 bg-transparent">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Create Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <CycleForm
              title="Create Cycle Template"
              description="Define a reusable cycle with timed steps"
              error={formError}
              onSubmit={handleCreate}
              onCancel={() => setIsCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="p-8">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            Failed to load cycle templates. Make sure the backend API is running.
          </div>
        )}

        {!isLoading && !error && templates?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <RotateCw className="h-12 w-12 mb-4" />
            <p>No cycle templates configured yet</p>
            <p className="text-sm">Click "Create Template" to define your first cycle</p>
          </div>
        )}

        <div className="grid gap-4">
          {templates?.map((template) => (
            <Card 
              key={template.id} 
              className={`border-border bg-card transition-colors ${expandedTemplateId === template.id ? 'ring-1 ring-primary/50' : ''}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div 
                    className="flex items-center gap-3 cursor-pointer flex-1"
                    onClick={() => setExpandedTemplateId(expandedTemplateId === template.id ? null : template.id)}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <RotateCw className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-foreground flex items-center gap-2">
                        {template.template_name}
                        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedTemplateId === template.id ? 'rotate-90' : ''}`} />
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">{template.station_type}</Badge>
                        <span className="text-xs">Tolerance: {template.tolerance_percent}%</span>
                        {template.total_expected_seconds && (
                          <span className="text-xs">Total: {formatTime(template.total_expected_seconds)}</span>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditDialog(template)
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeletingTemplate(template)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              {expandedTemplateId === template.id && (
                <CardContent className="pt-0">
                  <div className="rounded-lg border border-border mt-3">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border hover:bg-transparent">
                          <TableHead className="w-12 text-muted-foreground">#</TableHead>
                          <TableHead className="text-muted-foreground">Step Name</TableHead>
                          <TableHead className="text-right text-muted-foreground">Duration</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {expandedSteps?.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                              No steps defined. Click Edit to add steps.
                            </TableCell>
                          </TableRow>
                        ) : (
                          expandedSteps?.map((step) => (
                            <TableRow key={step.id} className="border-border">
                              <TableCell className="text-muted-foreground">{step.step_order}</TableCell>
                              <TableCell className="text-foreground">{step.step_name}</TableCell>
                              <TableCell className="text-right font-mono text-foreground">
                                {formatTime(step.expected_seconds)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="max-w-xl">
          {editingTemplate && (
            <CycleForm
              title="Edit Cycle Template"
              description="Modify the cycle template steps and timing"
              template={editingTemplate}
              initialSteps={editingSteps}
              error={formError}
              onSubmit={handleUpdate}
              onCancel={() => setEditingTemplate(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingTemplate} onOpenChange={(open) => !open && setDeletingTemplate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingTemplate?.template_name}"? This will also delete all associated steps. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingTemplate(null)} className="bg-transparent">Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Form component using native form like StationForm
function CycleForm({
  title,
  description,
  template,
  initialSteps = [],
  error,
  onSubmit,
  onCancel,
}: {
  title: string
  description: string
  template?: CycleTemplate
  initialSteps?: StepData[]
  error: string
  onSubmit: (formData: FormData) => void
  onCancel: () => void
}) {
  const [stepCount, setStepCount] = useState(initialSteps.length || 1)
  const [stepsData] = useState<StepData[]>(() => 
    initialSteps.length > 0 
      ? initialSteps 
      : [{ step_name: "", expected_seconds: 10, step_order: 1 }]
  )

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  }

  const addStep = () => {
    setStepCount(prev => prev + 1)
  }

  const removeStep = (index: number) => {
    if (stepCount > 1) {
      setStepCount(prev => prev - 1)
    }
  }

  return (
    <form action={onSubmit}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <RotateCw className="h-5 w-5" />
          {title}
        </DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
        {error && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label htmlFor="name">Template Name</Label>
            <Input 
              id="name"
              name="name"
              defaultValue={template?.template_name || ""}
              placeholder="e.g., Standard Assembly Cycle"
              required
            />
          </div>
          <div>
            <Label>Station Type</Label>
            <Select name="station_type" defaultValue={template?.station_type || "Assembly"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATION_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="tolerance">Tolerance (%)</Label>
            <Input 
              id="tolerance"
              name="tolerance"
              type="number"
              defaultValue={template?.tolerance_percent ?? 10}
              min="0"
              max="100"
            />
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <Label className="text-base">Cycle Steps</Label>
              <p className="text-sm text-muted-foreground">Add steps in order of execution</p>
            </div>
          </div>

          <div className="space-y-2">
            {Array.from({ length: stepCount }).map((_, index) => {
              const existingStep = stepsData[index]
              return (
                <div key={index} className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border">
                  <div className="flex items-center gap-2 text-muted-foreground w-8">
                    <GripVertical className="h-4 w-4" />
                    <span className="text-xs font-medium">{index + 1}</span>
                  </div>
                  {existingStep?.id && (
                    <input type="hidden" name={`step_id_${index}`} value={existingStep.id} />
                  )}
                  <Input
                    name={`step_name_${index}`}
                    placeholder="Step name"
                    defaultValue={existingStep?.step_name || ""}
                    className="flex-1"
                  />
                  <div className="flex items-center gap-1">
                    <Input
                      name={`step_seconds_${index}`}
                      type="number"
                      defaultValue={existingStep?.expected_seconds || 10}
                      className="w-20 text-right"
                      min="1"
                    />
                    <span className="text-sm text-muted-foreground">sec</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => removeStep(index)}
                    disabled={stepCount <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addStep}
            className="w-full mt-3 gap-2 bg-transparent"
          >
            <Plus className="h-4 w-4" />
            Add Step
          </Button>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} className="bg-transparent">
          Cancel
        </Button>
        <Button type="submit">
          <Save className="h-4 w-4 mr-2" />
          {template ? "Save Changes" : "Create Template"}
        </Button>
      </DialogFooter>
    </form>
  )
}
