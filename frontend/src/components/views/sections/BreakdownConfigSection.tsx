// Phase 7.10 — breakdown block config section (split out of
// BlockConfigSheet; controls and gating unchanged from 7.7/7.8). Owns
// the group-by + 1–4 column drafts. Columns 2+ inherit column 1's
// entity/template, so only column 1 renders those selects and a
// column-1 scope change resets the others' conditions — surfaced in a
// transient inline notice (Phase 7.8). Save gating: field defs loaded,
// group-by resolves against column 1's scope, every column has a
// non-empty label and a complete metric.
import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react"

import {
  type BreakdownBlockConfig,
  type MetricDefinition,
  type MetricScope,
} from "@/api/views"
import { useFieldDefs } from "@/api/templates"
import { MetricBuilder } from "@/components/views/MetricBuilder"
import {
  groupableOptionsFor,
  metricProblems,
} from "@/components/views/metricCatalog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

import { GroupBySelect } from "./GroupBySelect"
import {
  DEFAULT_METRIC,
  groupByFromConfig,
  isMetricShape,
  type SectionProps,
} from "./shared"

// Field-by-field scope equality — order-independent, unlike a
// JSON.stringify compare (ScopePicker's setters spread-then-override, so
// key order varies between scopes that are value-equal). cor_status is a
// list; the rest are scalar ids/strings.
function scopeEqual(a?: MetricScope, b?: MetricScope): boolean {
  const x = a ?? {}
  const y = b ?? {}
  return (
    (x.department_id ?? null) === (y.department_id ?? null) &&
    (x.client_id ?? null) === (y.client_id ?? null) &&
    (x.discipline_id ?? null) === (y.discipline_id ?? null) &&
    (x.lifecycle_state ?? null) === (y.lifecycle_state ?? null) &&
    JSON.stringify(x.cor_status ?? null) === JSON.stringify(y.cor_status ?? null)
  )
}

// Breakdown column draft; `open` is section-local UI state (collapsed
// builders) and is stripped before save.
type ColumnDraft = {
  label: string
  metric: MetricDefinition
  money: boolean
  open: boolean
}

function columnsFromConfig(
  config: SectionProps["initialConfig"],
): ColumnDraft[] {
  const c = config as Partial<BreakdownBlockConfig> | null
  if (Array.isArray(c?.columns) && c.columns.length > 0) {
    // Malformed stored columns (missing/mis-shaped metric, non-object
    // entries) fall back to safe drafts instead of throwing at render.
    return c.columns.map((col, i) => ({
      label: typeof col?.label === "string" ? col.label : "",
      metric: isMetricShape(col?.metric) ? col.metric : DEFAULT_METRIC,
      money: !!col?.money,
      open: i === 0,
    }))
  }
  return [{ label: "", metric: DEFAULT_METRIC, money: false, open: true }]
}

export function BreakdownConfigSection({
  initialConfig,
  onState,
}: SectionProps) {
  const [groupBy, setGroupBy] = useState(() => groupByFromConfig(initialConfig))
  const [columns, setColumns] = useState<ColumnDraft[]>(() =>
    columnsFromConfig(initialConfig),
  )
  // Transient notice after a column-1 scope change cascades a reset to
  // columns 2+ (Phase 7.8); auto-clears.
  const [cascadeNotice, setCascadeNotice] = useState(false)
  useEffect(() => {
    if (!cascadeNotice) return
    const t = setTimeout(() => setCascadeNotice(false), 6000)
    return () => clearTimeout(t)
  }, [cascadeNotice])

  // Column updates. A column-1 entity/template change cascades to
  // columns 2+ (they share its scope per the backend rule) and resets
  // their conditions/targets — those refs belonged to the old scope.
  const updateColumn = (idx: number, patch: Partial<ColumnDraft>) =>
    setColumns((cols) =>
      cols.map((col, i) => (i === idx ? { ...col, ...patch } : col)),
    )
  const updateColumnMetric = (idx: number, m: MetricDefinition) => {
    const prev = columns[idx].metric
    // A column-1 entity/template change alters the *available fields*, so
    // columns 2+ get reset; a column-1 scope change is a *pure filter*, so
    // it propagates while every column keeps its own agg/target/conditions
    // (Phase 7.14).
    const fieldsChanged =
      idx === 0 &&
      (m.entity !== prev.entity ||
        (m.template_id ?? null) !== (prev.template_id ?? null))
    const scopeChanged = idx === 0 && !scopeEqual(m.scope, prev.scope)
    if (fieldsChanged && columns.length > 1) setCascadeNotice(true)
    setColumns((cols) =>
      cols.map((col, i) => {
        if (i === idx) return { ...col, metric: m }
        if (fieldsChanged) {
          // Available fields changed — reset the column's metric, carry
          // the shared entity/template/scope.
          return {
            ...col,
            metric: {
              entity: m.entity,
              aggregation: "count",
              template_id: m.template_id ?? null,
              target_field: null,
              conditions: { combinator: "and", items: [] },
              scope: m.scope,
            },
          }
        }
        if (scopeChanged) {
          // Scope is a pure filter — propagate it, keep this column's
          // aggregation/target/conditions.
          return { ...col, metric: { ...col.metric, scope: m.scope } }
        }
        return col
      }),
    )
  }
  const addColumn = () =>
    setColumns((cols) => [
      ...cols,
      {
        label: "",
        money: false,
        open: true,
        metric: {
          ...DEFAULT_METRIC,
          entity: cols[0].metric.entity,
          template_id: cols[0].metric.template_id ?? null,
        },
      },
    ])
  const removeColumn = (idx: number) =>
    setColumns((cols) => cols.filter((_, i) => i !== idx))

  // Column 1 drives the group-by catalog. The field-defs query is
  // shared (same key) with the one inside MetricBuilder, so this adds
  // no extra fetch.
  const primaryMetric = columns[0].metric
  const templateId =
    primaryMetric.entity === "project"
      ? (primaryMetric.template_id ?? undefined)
      : undefined
  const fieldsQ = useFieldDefs(templateId)
  const customFields = templateId ? (fieldsQ.data?.items ?? []) : []
  const fieldsReady = !templateId || fieldsQ.data !== undefined
  const groupOpts = groupableOptionsFor(primaryMetric.entity, customFields)
  // A stale group_by (entity/template changed underneath it) fails
  // this check and disables Save until re-picked.
  const groupByValid = groupOpts.some((o) => o.ref === groupBy)

  const valid =
    fieldsReady &&
    groupByValid &&
    !columns.some(
      (col) =>
        col.label.trim() === "" ||
        metricProblems(col.metric, customFields).length > 0,
    )
  const hint = valid
    ? ""
    : " Pick a group-by, and give every column a label and a complete metric."

  useEffect(() => {
    const config: BreakdownBlockConfig = {
      group_by: groupBy,
      columns: columns.map((col) => ({
        label: col.label.trim(),
        metric: col.metric,
        money: col.money,
      })),
    }
    onState({
      config: config as unknown as Record<string, unknown>,
      valid,
      hint,
    })
    // onState is referentially stable (a setState in the shell).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, columns, valid, hint])

  return (
    <>
      <GroupBySelect
        groupBy={groupBy}
        groupByValid={groupByValid}
        groupOpts={groupOpts}
        onChange={setGroupBy}
      />

      <div className="space-y-2">
        <Label>Columns (1–4)</Label>
        {cascadeNotice && (
          <p
            role="status"
            className="rounded-md border border-amber-300/60 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          >
            Changing the first column's entity or template reset the
            other columns' metrics.
          </p>
        )}
        {columns.map((col, i) => (
          <div key={i} className="space-y-2 rounded-md border p-2">
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label={`${col.open ? "Collapse" : "Expand"} column ${i + 1} metric`}
                aria-expanded={col.open}
                onClick={() => updateColumn(i, { open: !col.open })}
              >
                {col.open ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
              </Button>
              <Input
                aria-label={`Column ${i + 1} label`}
                placeholder="Column label"
                maxLength={60}
                className="h-8 text-xs"
                value={col.label}
                onChange={(e) => updateColumn(i, { label: e.target.value })}
              />
              {columns.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label={`Remove column ${i + 1}`}
                  onClick={() => removeColumn(i)}
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </div>
            {col.open && (
              <>
                <MetricBuilder
                  value={col.metric}
                  onChange={(m) => updateColumnMetric(i, m)}
                  excludePct
                  lockEntity={i > 0}
                  idPrefix={`mb-col-${i}`}
                />
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor={`block-cfg-col-money-${i}`}
                    className="text-xs"
                  >
                    Format as money
                  </Label>
                  <Switch
                    id={`block-cfg-col-money-${i}`}
                    checked={col.money}
                    onCheckedChange={(v) => updateColumn(i, { money: v })}
                  />
                </div>
              </>
            )}
          </div>
        ))}
        {columns.length < 4 && (
          <Button type="button" variant="outline" size="sm" onClick={addColumn}>
            <Plus className="mr-1 size-3.5" /> Add column
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          Columns 2+ share the first column's entity and template;
          each keeps its own conditions and aggregation.
        </p>
      </div>
    </>
  )
}
