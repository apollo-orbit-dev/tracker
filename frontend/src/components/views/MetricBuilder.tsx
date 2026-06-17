// Phase 7.4 — metric builder: controlled entity/aggregation/conditions
// form with a debounced, server-validated live preview.
//
// The field/op/aggregation catalogs live in metricCatalog.ts (Phase
// 7.7 extraction — they mirror the backend engine; see that file's
// header). Nothing is evaluated client-side; every preview round-trips
// through POST /api/metrics/eval, where validate_metric is the
// boundary validator.
import { useEffect } from "react"

import {
  type MetricDefinition,
  type MetricScope,
  useMetricEval,
} from "@/api/views"
import { useFieldDefs, useTemplateList } from "@/api/templates"
import { Badge } from "@/components/Badge"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { ConditionsEditor } from "./ConditionsEditor"
import { SavedMetricsMenu } from "./SavedMetricsMenu"
import { ScopePicker } from "./ScopePicker"
import {
  AGG_OPTIONS,
  COR_FIELDS,
  type FieldKind,
  MILESTONE_AGGS,
  NUMERIC_FIELD_TYPES,
  PROJECT_BUILTINS,
  fieldOptionsFor,
  formatValue,
  metricProblems,
  needsTarget,
} from "./metricCatalog"

// ---- component ------------------------------------------------------------

type Props = {
  value: MetricDefinition
  onChange: (m: MetricDefinition) => void
  /** Hide pct_of_total — grouped contexts (chart metrics, breakdown
   *  columns) where the backend rejects it (Phase 7.7). */
  excludePct?: boolean
  /** Hide the entity/template selects — breakdown columns 2+ inherit
   *  column 1's scope, so only column 1 renders them (Phase 7.7). */
  lockEntity?: boolean
  /** Prefix for the labeled controls' element ids. Callers rendering
   *  multiple builders at once (breakdown columns) must pass distinct
   *  prefixes so ids stay unique in the document (Phase 7.8). */
  idPrefix?: string
}

export function MetricBuilder({
  value,
  onChange,
  excludePct = false,
  lockEntity = false,
  idPrefix = "mb",
}: Props) {
  const templates = useTemplateList()
  const templateId =
    value.entity === "project" ? (value.template_id ?? undefined) : undefined
  const fieldsQ = useFieldDefs(templateId)
  const customFields = templateId ? (fieldsQ.data?.items ?? []) : []
  const fieldOpts = fieldOptionsFor(value.entity, customFields)
  const conditions = value.conditions ?? { combinator: "and" as const, items: [] }

  const aggOptions = (
    value.entity === "milestone"
      ? AGG_OPTIONS.filter((a) => MILESTONE_AGGS.has(a.value))
      : AGG_OPTIONS
  ).filter((a) => !excludePct || a.value !== "pct_of_total")

  // Target catalog: numeric aggregations need a numeric target
  // (project: numeric custom fields; cor: amount); count_distinct
  // accepts any condition-able field.
  const targetOpts = !needsTarget(value.aggregation)
    ? []
    : value.aggregation === "count_distinct"
      ? fieldOpts
      : value.entity === "cor"
        ? COR_FIELDS.filter((f) => f.kind === "number")
        : customFields
            .filter((f) => NUMERIC_FIELD_TYPES.has(f.field_type))
            .map((f) => ({
              ref: f.id,
              label: f.name,
              kind: "number" as FieldKind,
              choices: null,
            }))

  const setEntity = (entity: MetricDefinition["entity"]) =>
    // scope (DCD + lifecycle) is entity-agnostic — _scoped_base applies it
    // through the project/template join for all three entities — so it's
    // intentionally preserved across an entity switch (unlike target/
    // conditions/template, which reference entity-specific fields).
    onChange({
      ...value,
      entity,
      aggregation: "count",
      template_id: null,
      target_field: null,
      conditions: { combinator: conditions.combinator, items: [] },
    })

  const setAggregation = (aggregation: MetricDefinition["aggregation"]) =>
    onChange({
      ...value,
      aggregation,
      // Drop a target the new aggregation can't use (numeric aggs are
      // stricter than count_distinct; count/pct take none at all).
      target_field: needsTarget(aggregation) ? (value.target_field ?? null) : null,
    })

  const setTemplate = (template_id: string | null) =>
    onChange({
      ...value,
      template_id,
      // Custom-field refs belong to the old template — prune them.
      target_field:
        value.target_field &&
        PROJECT_BUILTINS.some((b) => b.ref === value.target_field)
          ? value.target_field
          : null,
      conditions: {
        combinator: conditions.combinator,
        items: conditions.items.filter((c) =>
          PROJECT_BUILTINS.some((b) => b.ref === c.field),
        ),
      },
      // Phase 7.14: a template implies its dept/client/discipline, so
      // clear any DCD scope it would otherwise contradict. Lifecycle is
      // orthogonal and preserved.
      scope: {
        ...(value.scope ?? {}),
        department_id: template_id ? null : (value.scope?.department_id ?? null),
        client_id: template_id ? null : (value.scope?.client_id ?? null),
        discipline_id: template_id ? null : (value.scope?.discipline_id ?? null),
      },
    })

  // Phase 7.14 — scope controls. DCD is hidden when a project template
  // is selected (the template supersedes its DCD intersection); lifecycle
  // is always offered. The whole section hides for breakdown columns 2+
  // (lockEntity), which inherit column 1's shared scope.
  const scope = value.scope ?? {}
  const templateSelected = value.entity === "project" && !!value.template_id
  const setScope = (next: MetricScope) => onChange({ ...value, scope: next })

  // ---- live preview (server-validated; debounced 400ms) ----
  const evalMut = useMetricEval()
  const { mutate: runEval } = evalMut
  const serialized = JSON.stringify(value)
  const debounced = useDebouncedValue(serialized, 400)
  // While custom-field defs are loading, refs in the draft look
  // "unknown" — wait for them before judging completeness.
  const fieldsReady = !templateId || fieldsQ.data !== undefined
  const problems = fieldsReady ? metricProblems(value, customFields) : ["loading fields"]
  useEffect(() => {
    if (!fieldsReady) return
    const m = JSON.parse(debounced) as MetricDefinition
    // Only eval plausibly-complete drafts — incomplete ones are
    // guaranteed 422s and would just spam the endpoint.
    if (metricProblems(m, customFields).length > 0) return
    runEval(m)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, fieldsReady, runEval])

  return (
    <div className="space-y-4">
      {/* Header row (mock: "Metric" label left, saved-metrics library
          right). Rendered for every consumer — breakdown columns
          benefit too (plan decision 7). The menu is self-contained;
          applying replaces the whole draft with a copy of the stored
          config and the preview/save re-validate it server-side. */}
      <div className="flex items-center justify-between">
        <Label>Metric</Label>
        <SavedMetricsMenu current={value} onApply={onChange} />
      </div>

      {!lockEntity && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-entity`}>Entity</Label>
          <Select value={value.entity} onValueChange={setEntity}>
            <SelectTrigger id={`${idPrefix}-entity`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project">Projects</SelectItem>
              <SelectItem value="milestone">Milestones</SelectItem>
              <SelectItem value="cor">Change orders</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-agg`}>Aggregation</Label>
        <Select value={value.aggregation} onValueChange={setAggregation}>
          <SelectTrigger id={`${idPrefix}-agg`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {aggOptions.map((a) => (
              <SelectItem key={a.value} value={a.value}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {value.entity === "project" && !lockEntity && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-template`}>Template</Label>
          <Select
            value={value.template_id ?? "__none__"}
            onValueChange={(v) => setTemplate(v === "__none__" ? null : v)}
            disabled={templates.isLoading}
          >
            <SelectTrigger id={`${idPrefix}-template`}>
              <SelectValue placeholder="All templates" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">All templates</SelectItem>
              {(templates.data?.items ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Pick a template to use its custom fields in conditions.
          </p>
        </div>
      )}

      {needsTarget(value.aggregation) && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-target`}>Target field</Label>
          <Select
            value={value.target_field ?? ""}
            onValueChange={(v) => onChange({ ...value, target_field: v })}
            disabled={targetOpts.length === 0}
          >
            <SelectTrigger id={`${idPrefix}-target`}>
              <SelectValue
                placeholder={
                  targetOpts.length === 0
                    ? value.entity === "project"
                      ? "Pick a template with numeric fields"
                      : "No fields available"
                    : "Select a field"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {targetOpts.map((f) => (
                <SelectItem key={f.ref} value={f.ref}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <ConditionsEditor
        fieldOpts={fieldOpts}
        conditions={conditions}
        onChange={(c) => onChange({ ...value, conditions: c })}
        idPrefix={idPrefix}
      />

      {!lockEntity && (
        <div className="space-y-1.5">
          <Label>Scope</Label>
          <ScopePicker
            scope={scope}
            show={{ dcd: !templateSelected, lifecycle: true }}
            onChange={setScope}
            idPrefix={idPrefix}
          />
        </div>
      )}

      <div className="space-y-1 rounded-md border bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Live preview
          </p>
          {/* Server-validated marker (open item 25): only for a
              successful eval of the CURRENT draft — hidden while
              pending, on error, or when the draft changed since the
              eval (stale). evalMut.variables is the payload the last
              eval ran with; comparing its serialization to the current
              draft closes the debounce gap. */}
          {problems.length === 0 &&
            evalMut.isSuccess &&
            serialized === debounced &&
            JSON.stringify(evalMut.variables) === serialized && (
              <Badge tone="emerald">validated ✓</Badge>
            )}
        </div>
        {problems.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Finish the metric to preview it.
          </p>
        ) : evalMut.isPending ? (
          <p className="text-sm text-muted-foreground">Evaluating…</p>
        ) : evalMut.isError ? (
          <p className="text-xs text-red-600">{evalMut.error.detail}</p>
        ) : evalMut.data ? (
          <div className="text-2xl font-semibold tabular-nums">
            {formatValue(evalMut.data.value, {
              pct: value.aggregation === "pct_of_total",
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Waiting for input…</p>
        )}
      </div>
    </div>
  )
}
