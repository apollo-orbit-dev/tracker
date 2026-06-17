import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { WIDGET_BY_TYPE } from "@/components/widgets/WidgetLibrary"
import { ApiError } from "@/api/auth"
import {
  type DashboardWidget,
  type FieldAggregateConfig,
  type WidgetUpdate,
  useWidgetUpdate,
} from "@/api/dashboard_widgets"
import { useMyDepartments } from "@/api/me"
import { useTaxonomyList } from "@/api/taxonomy"
import { useFieldDefs, useTemplateList } from "@/api/templates"

const NONE = "__none__"
const NUMERIC_FIELD_TYPES = new Set(["integer", "decimal", "currency", "percent"])

const DCD_FILTER_TYPES = new Set([
  "lifecycle",
  "milestone_lookahead",
  "recent_activity",
  "cor_summary",
])

type Props = {
  dashboardId: string
  widget: DashboardWidget | null
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function WidgetConfigSheet({
  dashboardId,
  widget,
  onOpenChange,
  onSuccess,
}: Props) {
  const open = widget !== null
  const update = useWidgetUpdate(dashboardId)
  const error = update.error instanceof ApiError ? update.error : null
  const descriptor = widget ? WIDGET_BY_TYPE[widget.widget_type] : undefined
  const defaultLabel = descriptor?.label ?? "Widget"
  const isFieldAgg = widget?.widget_type === "field_aggregate"
  const isDcd = widget ? DCD_FILTER_TYPES.has(widget.widget_type) : false
  const isLookahead = widget?.widget_type === "milestone_lookahead"

  // Title state — shared across all widget types.
  const [title, setTitle] = useState<string>(widget?.title ?? "")

  // field_aggregate state.
  const initialFA = (widget?.config ?? {}) as Partial<FieldAggregateConfig>
  const [templateId, setTemplateId] = useState<string>(
    initialFA.template_id ?? "",
  )
  const [primaryFieldId, setPrimaryFieldId] = useState<string>(
    initialFA.primary_field_id ?? "",
  )
  const [secondaryFieldId, setSecondaryFieldId] = useState<string>(
    initialFA.secondary_field_id ?? NONE,
  )

  // DCD-filter state (for the four 2.0 widgets).
  type DcdConfig = {
    department_id?: string | null
    client_id?: string | null
    discipline_id?: string | null
  }
  const initialDcd = (widget?.config ?? {}) as Partial<DcdConfig>
  const [deptId, setDeptId] = useState<string>(initialDcd.department_id ?? NONE)
  const [clientId, setClientId] = useState<string>(initialDcd.client_id ?? NONE)
  const [disciplineId, setDisciplineId] = useState<string>(
    initialDcd.discipline_id ?? NONE,
  )

  // Phase 2.8 — milestone_lookahead's per-widget future_days override.
  // Stored as a string so an empty input is representable; "" → no
  // future_days key in the saved config (server uses its default).
  const initialDays =
    typeof (widget?.config as Record<string, unknown> | undefined)?.future_days ===
    "number"
      ? String((widget?.config as Record<string, unknown>).future_days)
      : ""
  const [daysInput, setDaysInput] = useState<string>(initialDays)

  // Reset when the sheet opens for a different widget.
  useEffect(() => {
    if (open && widget) {
      setTitle(widget.title ?? "")
      const fa = (widget.config ?? {}) as Partial<FieldAggregateConfig>
      setTemplateId(fa.template_id ?? "")
      setPrimaryFieldId(fa.primary_field_id ?? "")
      setSecondaryFieldId(fa.secondary_field_id ?? NONE)
      const dcd = (widget.config ?? {}) as Partial<DcdConfig>
      setDeptId(dcd.department_id ?? NONE)
      setClientId(dcd.client_id ?? NONE)
      setDisciplineId(dcd.discipline_id ?? NONE)
      const days = (widget.config as Record<string, unknown> | undefined)
        ?.future_days
      setDaysInput(typeof days === "number" ? String(days) : "")
      update.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, widget?.id])

  const templates = useTemplateList()
  const fields = useFieldDefs(templateId || undefined)
  const numericFields = (fields.data?.items ?? []).filter((f) =>
    NUMERIC_FIELD_TYPES.has(f.field_type),
  )

  // Reset field choices when template changes to avoid orphan IDs.
  useEffect(() => {
    const ids = new Set(numericFields.map((f) => f.id))
    if (primaryFieldId && !ids.has(primaryFieldId) && fields.data) {
      setPrimaryFieldId("")
    }
    if (
      secondaryFieldId !== NONE &&
      !ids.has(secondaryFieldId) &&
      fields.data
    ) {
      setSecondaryFieldId(NONE)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields.data?.items.map((f) => f.id).join("|")])

  // For DCD widgets — load lists scoped to the chosen dept.
  const myDepts = useMyDepartments()
  const allClients = useTaxonomyList("clients", false)
  const allDisciplines = useTaxonomyList("disciplines", false)
  const clientsForDept = (allClients.data?.items ?? []).filter(
    (c) => deptId !== NONE && c.department_id === deptId,
  )
  const disciplinesForDept = (allDisciplines.data?.items ?? []).filter(
    (d) => deptId !== NONE && d.department_id === deptId,
  )

  // When dept changes, drop any client/discipline that no longer fits.
  useEffect(() => {
    if (deptId === NONE) {
      setClientId(NONE)
      setDisciplineId(NONE)
      return
    }
    const cIds = new Set(clientsForDept.map((c) => c.id))
    if (clientId !== NONE && !cIds.has(clientId)) setClientId(NONE)
    const dIds = new Set(disciplinesForDept.map((d) => d.id))
    if (disciplineId !== NONE && !dIds.has(disciplineId)) setDisciplineId(NONE)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptId, clientsForDept.map((c) => c.id).join("|"), disciplinesForDept.map((d) => d.id).join("|")])

  if (!widget) return null

  const onSubmit = () => {
    const body: WidgetUpdate = {
      title: title.trim() ? title.trim() : null,
    }

    if (isFieldAgg) {
      if (templateId && primaryFieldId) {
        const config: FieldAggregateConfig = {
          template_id: templateId,
          primary_field_id: primaryFieldId,
          secondary_field_id:
            secondaryFieldId === NONE ? null : secondaryFieldId,
        }
        body.config = config as unknown as Record<string, unknown>
      } else if (widget.config) {
        toast.error(
          "Pick a template and a primary field, or leave the existing config untouched",
        )
        return
      }
    } else if (isDcd) {
      // Build a DCD config from the current selects. Empty config = no
      // narrowing (same as unconfigured).
      const cfg: Record<string, unknown> = {}
      if (deptId !== NONE) cfg.department_id = deptId
      if (clientId !== NONE) cfg.client_id = clientId
      if (disciplineId !== NONE) cfg.discipline_id = disciplineId
      if (isLookahead && daysInput.trim()) {
        const n = Number(daysInput)
        if (!Number.isInteger(n) || n < 1 || n > 365) {
          toast.error(
            "Lookahead window must be a whole number between 1 and 365.",
          )
          return
        }
        cfg.future_days = n
      }
      body.config = Object.keys(cfg).length ? cfg : null
    }

    update.mutate(
      { id: widget.id, body },
      {
        onSuccess: () => {
          onOpenChange(false)
          onSuccess?.()
        },
      },
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Configure widget</SheetTitle>
          <SheetDescription>
            Change the title and (optionally) narrow the data this widget
            shows. Leave filters blank for "everything in my accessible
            departments".
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-4">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Save failed</AlertTitle>
              <AlertDescription>{error.detail}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cfg-title">Title</Label>
            <Input
              id="cfg-title"
              maxLength={200}
              placeholder={defaultLabel}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to use the default ({defaultLabel}).
            </p>
          </div>

          {isDcd && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="cfg-dept">Department</Label>
                <Select
                  value={deptId}
                  onValueChange={(v) => {
                    setDeptId(v)
                    setClientId(NONE)
                    setDisciplineId(NONE)
                  }}
                  disabled={myDepts.isLoading}
                >
                  <SelectTrigger id="cfg-dept">
                    <SelectValue placeholder="All departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>All departments</SelectItem>
                    {(myDepts.data ?? []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.code} — {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cfg-client">Client</Label>
                <Select
                  value={clientId}
                  onValueChange={setClientId}
                  disabled={deptId === NONE || allClients.isLoading}
                >
                  <SelectTrigger id="cfg-client">
                    <SelectValue
                      placeholder={
                        deptId === NONE
                          ? "Pick a department first"
                          : "All clients"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>All clients</SelectItem>
                    {clientsForDept.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cfg-discipline">Discipline</Label>
                <Select
                  value={disciplineId}
                  onValueChange={setDisciplineId}
                  disabled={deptId === NONE || allDisciplines.isLoading}
                >
                  <SelectTrigger id="cfg-discipline">
                    <SelectValue
                      placeholder={
                        deptId === NONE
                          ? "Pick a department first"
                          : "All disciplines"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>All disciplines</SelectItem>
                    {disciplinesForDept.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.code} — {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isLookahead && (
                <div className="space-y-1.5">
                  <Label htmlFor="cfg-lookahead-days">
                    Lookahead window (days)
                  </Label>
                  <Input
                    id="cfg-lookahead-days"
                    type="number"
                    min={1}
                    max={365}
                    placeholder="60 (default)"
                    value={daysInput}
                    onChange={(e) => setDaysInput(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank for the default (60). Past-due milestones
                    always show regardless.
                  </p>
                </div>
              )}
            </>
          )}

          {isFieldAgg && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="cfg-template">Template</Label>
                <Select
                  value={templateId}
                  onValueChange={(v) => {
                    setTemplateId(v)
                    setPrimaryFieldId("")
                    setSecondaryFieldId(NONE)
                  }}
                  disabled={templates.isLoading}
                >
                  <SelectTrigger id="cfg-template">
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {(templates.data?.items ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cfg-primary">Primary field</Label>
                <Select
                  value={primaryFieldId}
                  onValueChange={setPrimaryFieldId}
                  disabled={!templateId || fields.isLoading || numericFields.length === 0}
                >
                  <SelectTrigger id="cfg-primary">
                    <SelectValue
                      placeholder={
                        !templateId
                          ? "Pick a template first"
                          : numericFields.length === 0
                            ? "No numeric fields on this template"
                            : "Select a numeric field"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {numericFields.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({f.field_type})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cfg-secondary">Secondary field (optional)</Label>
                <Select
                  value={secondaryFieldId}
                  onValueChange={setSecondaryFieldId}
                  disabled={!templateId || fields.isLoading}
                >
                  <SelectTrigger id="cfg-secondary">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {numericFields
                      .filter((f) => f.id !== primaryFieldId)
                      .map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}{" "}
                          <span className="text-xs text-muted-foreground">
                            ({f.field_type})
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <SheetFooter>
            <Button
              type="button"
              onClick={onSubmit}
              disabled={update.isPending}
            >
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}
