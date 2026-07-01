// Phase 7.7 — metric catalogs, extracted from MetricBuilder.tsx (open
// item 27) so the chart/breakdown config UI and the builder share one
// pure module (no React imports; keeps MetricBuilder free of
// react-refresh/only-export-components hits).
//
// SECURITY: these catalogs (fields, ops, aggregations, groupability)
// exist for UX only — they mirror backend/app/services/metric_engine.py
// exactly (OPS_BY_KIND, FIELD_TYPE_TO_KIND, DATE_SUBFIELDS,
// PROJECT_BUILTINS, MILESTONE_FIELDS, COR_FIELDS, NUMERIC_AGGS,
// GROUPABLE_KINDS, milestone count/pct restriction). Nothing is
// evaluated client-side; every preview and block payload round-trips
// through the API, where validate_metric / validate_block_config are
// the boundary validators. Keep the two in sync when either changes.
//
// Phase 7.8 catalog expansion (matching the Phase 7.6 engine, open
// item 28): url/email/phone condition as kind text;
// date_planned_actual / date_range expose ONLY their virtual date
// sub-fields ("<uuid>.planned" / ".actual", "<uuid>.start" / ".end" —
// never a bare-uuid ref; the engine rejects one). auto_number,
// duration, and reference types stay deferred.
import type { MetricCondition, MetricDefinition } from "@/api/views"
import type { FieldDef } from "@/api/templates"

export type FieldKind = "boolean" | "select" | "number" | "date" | "text"

export const OPS_BY_KIND: Record<FieldKind, { value: string; label: string }[]> = {
  boolean: [
    { value: "is_true", label: "is true" },
    { value: "is_false", label: "is false" },
    { value: "is_empty", label: "is empty" },
  ],
  select: [
    { value: "in", label: "is any of" },
    { value: "not_in", label: "is none of" },
  ],
  number: [
    { value: "eq", label: "=" },
    { value: "gt", label: ">" },
    { value: "lt", label: "<" },
    { value: "between", label: "between" },
  ],
  date: [
    { value: "before", label: "before" },
    { value: "after", label: "after" },
    { value: "between", label: "between" },
    { value: "last_n_days", label: "in the last N days" },
    { value: "next_n_days", label: "in the next N days" },
    { value: "this_month", label: "this month" },
    { value: "this_quarter", label: "this quarter" },
    { value: "last_month", label: "last month" },
    { value: "on_or_before_today", label: "≤ today" },
    { value: "is_empty", label: "is empty" },
  ],
  text: [
    { value: "equals", label: "equals" },
    { value: "contains", label: "contains" },
  ],
}

// Custom-field types the engine supports (FIELD_TYPE_TO_KIND keys);
// reference types / auto_number etc. are excluded in v1.
export const FIELD_TYPE_TO_KIND: Record<string, FieldKind> = {
  boolean: "boolean",
  boolean_conditional_date: "boolean",
  boolean_conditional_text: "boolean",
  single_select: "select",
  multi_select: "select",
  integer: "number",
  decimal: "number",
  currency: "number",
  percent: "number",
  date: "date",
  short_text: "text",
  long_text: "text",
  url: "text",
  email: "text",
  phone: "text",
}

// Mirrors the engine's DATE_SUBFIELDS: these two field types are
// usable only through virtual date sub-refs ("<uuid>.<sub>"). They are
// deliberately NOT in FIELD_TYPE_TO_KIND — fieldOptionsFor expands
// them into their two sub-options instead of a bare-uuid option.
export const DATE_SUBFIELDS: Record<string, readonly [string, string]> = {
  date_planned_actual: ["planned", "actual"],
  date_range: ["start", "end"],
}

// Date ops that carry no value (presets). Single source so valueProblems
// (this catalog) and ConditionsEditor's ConditionValue (the builder UI)
// never drift — adding a no-value date op touches this set only.
// Mirrors the backend engine's no-value date branch (Phase 7.17:
// last_month / on_or_before_today join the existing this_month /
// this_quarter).
export const NO_VALUE_DATE_OPS = new Set([
  "this_month",
  "this_quarter",
  "last_month",
  "on_or_before_today",
])

export const NUMERIC_FIELD_TYPES = new Set([
  "integer",
  "decimal",
  "currency",
  "percent",
])

export const LIFECYCLE_STATES = [
  "draft",
  "active",
  "on_hold",
  "complete",
  "cancelled",
]
export const COR_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "cancelled",
]
export const ASSIGNMENT_STATUSES = ["open", "in_progress", "done", "cancelled"]
export const MILESTONE_DIRECTIONS = ["outbound", "inbound", "internal", "external"]

export type FieldOption = {
  ref: string
  label: string
  kind: FieldKind
  choices: string[] | null
  /** True for multi_select custom fields — condition-able but never
   *  groupable (a project in N tag-groups would double-count). */
  multiSelect?: boolean
}

export const PROJECT_BUILTINS: FieldOption[] = [
  { ref: "lifecycle_state", label: "Lifecycle state", kind: "select", choices: LIFECYCLE_STATES },
  { ref: "title", label: "Title", kind: "text", choices: null },
  { ref: "project_number", label: "project number", kind: "text", choices: null },
  { ref: "client_project_number", label: "Client project number", kind: "text", choices: null },
  { ref: "created_at", label: "Created", kind: "date", choices: null },
]
export const MILESTONE_FIELDS: FieldOption[] = [
  { ref: "planned", label: "Planned date", kind: "date", choices: null },
  { ref: "actual", label: "Actual date", kind: "date", choices: null },
  { ref: "direction", label: "Direction", kind: "select", choices: MILESTONE_DIRECTIONS },
  { ref: "name", label: "Name", kind: "text", choices: null },
]
export const COR_FIELDS: FieldOption[] = [
  { ref: "status", label: "Status", kind: "select", choices: COR_STATUSES },
  { ref: "amount", label: "Amount", kind: "number", choices: null },
  { ref: "submitted_date", label: "Submitted date", kind: "date", choices: null },
  { ref: "approved_date", label: "Approved date", kind: "date", choices: null },
]
export const ASSIGNMENT_FIELDS: FieldOption[] = [
  { ref: "status", label: "Status", kind: "select", choices: ASSIGNMENT_STATUSES },
  { ref: "due_date", label: "Due date", kind: "date", choices: null },
  { ref: "created_at", label: "Created", kind: "date", choices: null },
]

export const NUMERIC_AGGS = new Set(["sum", "avg", "min", "max"])

export const AGG_OPTIONS: {
  value: MetricDefinition["aggregation"]
  label: string
}[] = [
  { value: "count", label: "Count" },
  { value: "count_distinct", label: "Count distinct" },
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
  { value: "pct_of_total", label: "% of total" },
]
// Mirrors the engine: milestone + assignment metrics support count /
// pct_of_total only (no numeric field to aggregate).
export const MILESTONE_AGGS = new Set(["count", "pct_of_total"])
export const ASSIGNMENT_AGGS = new Set(["count", "pct_of_total"])

export function fieldOptionsFor(
  entity: MetricDefinition["entity"],
  customFields: FieldDef[],
): FieldOption[] {
  if (entity === "milestone") return MILESTONE_FIELDS
  if (entity === "cor") return COR_FIELDS
  if (entity === "assignment") return ASSIGNMENT_FIELDS
  return [
    ...PROJECT_BUILTINS,
    ...customFields.flatMap<FieldOption>((f) => {
      const subs = DATE_SUBFIELDS[f.field_type]
      if (subs) {
        // Sub-ref-only types: two date options, no bare-uuid option.
        return subs.map((sub) => ({
          ref: `${f.id}.${sub}`,
          label: `${f.name} (${sub})`,
          kind: "date" as FieldKind,
          choices: null,
        }))
      }
      if (FIELD_TYPE_TO_KIND[f.field_type] === undefined) return []
      return [
        {
          ref: f.id,
          label: f.name,
          kind: FIELD_TYPE_TO_KIND[f.field_type],
          choices:
            FIELD_TYPE_TO_KIND[f.field_type] === "select"
              ? (f.options?.choices ?? [])
              : null,
          ...(f.field_type === "multi_select" ? { multiSelect: true } : {}),
        },
      ]
    }),
  ]
}

// Groupable: select + boolean kinds, minus multi_select (a project in
// N tag-groups would double-count). Mirrors GROUPABLE_KINDS backend-side.
export function groupableOptionsFor(
  entity: MetricDefinition["entity"],
  customFields: FieldDef[],
): FieldOption[] {
  return fieldOptionsFor(entity, customFields).filter(
    (o) => (o.kind === "select" || o.kind === "boolean") && !o.multiSelect,
  )
}

/** THE shared display formatter for server-evaluated metric values
 *  (Phase 7.8) — used by MetricCardBlock, ChartBlock, BreakdownBlock,
 *  and the MetricBuilder live preview. `raw` is the wire value (a
 *  Decimal-serialized JSON string, or null). pct (pct_of_total) wins
 *  over money; compact only kicks in for money values ≥ 100k. */
export function formatValue(
  raw: string | null,
  opts: { money?: boolean; compact?: boolean; pct?: boolean },
): string {
  if (raw === null) return "—"
  const n = Number(raw)
  if (opts.pct) return n.toLocaleString() + "%"
  if (opts.money) {
    if (opts.compact && Math.abs(n) >= 100_000) {
      return "$" + Math.round(n / 1000).toLocaleString() + "k"
    }
    return "$" + n.toLocaleString()
  }
  return n.toLocaleString()
}

export function needsTarget(agg: MetricDefinition["aggregation"]): boolean {
  return NUMERIC_AGGS.has(agg) || agg === "count_distinct"
}

export function isFiniteNumber(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v)
}

export function valueProblems(c: MetricCondition, kind: FieldKind): string[] {
  const v = c.value
  if (c.op === "is_empty" || kind === "boolean") return []
  if (kind === "select") {
    return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string")
      ? []
      : ["pick at least one value"]
  }
  if (kind === "number") {
    if (c.op === "between") {
      return Array.isArray(v) && v.length === 2 && v.every(isFiniteNumber)
        ? []
        : ["between needs two numbers"]
    }
    return isFiniteNumber(v) ? [] : ["enter a number"]
  }
  if (kind === "date") {
    if (NO_VALUE_DATE_OPS.has(c.op)) return []
    if (c.op === "last_n_days" || c.op === "next_n_days") {
      return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 730
        ? []
        : ["enter a number of days (1–730)"]
    }
    if (c.op === "between") {
      return Array.isArray(v) &&
        v.length === 2 &&
        v.every((x) => typeof x === "string" && x.length > 0)
        ? []
        : ["pick both dates"]
    }
    return typeof v === "string" && v.length > 0 ? [] : ["pick a date"]
  }
  // text
  return typeof v === "string" && v.length >= 1 && v.length <= 200
    ? []
    : ["enter text (max 200 chars)"]
}

/** Lightweight completeness check used to gate the live preview and the
 *  config-sheet Save button. Mirrors (but never replaces) the backend's
 *  validate_metric — the server stays the boundary validator. */
export function metricProblems(
  m: MetricDefinition,
  customFields: FieldDef[],
): string[] {
  const problems: string[] = []
  const byRef = new Map(
    fieldOptionsFor(m.entity, customFields).map((o) => [o.ref, o]),
  )
  for (const c of m.conditions?.items ?? []) {
    const f = byRef.get(c.field)
    if (!f) {
      problems.push(`unknown field: ${c.field}`)
      continue
    }
    if (!OPS_BY_KIND[f.kind].some((o) => o.value === c.op)) {
      problems.push(`op ${c.op} not allowed for ${f.kind} field`)
      continue
    }
    problems.push(...valueProblems(c, f.kind))
  }
  if (needsTarget(m.aggregation) && !m.target_field) {
    problems.push("pick a target field")
  }
  if (m.entity === "milestone" && !MILESTONE_AGGS.has(m.aggregation)) {
    problems.push("milestone metrics support count / % of total only")
  }
  if (m.entity === "assignment" && !ASSIGNMENT_AGGS.has(m.aggregation)) {
    problems.push("assignment metrics support count / % of total only")
  }
  return problems
}
