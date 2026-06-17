// Phase 7.11 — Saved View table block config section. Owns the
// template / columns / lifecycle / search / limit / sort drafts and
// reports them as a TableBlockConfig (view_columns grammar). The
// column picker mirrors the page's ColumnPickerSheet option list
// (availableColumnsForTemplate: built-ins + live fields + milestones
// expanded to date|planned|actual per their date_model), grouped into
// Built-ins / Fields / Milestones with the 1–8 cap mirrored
// client-side. Template change resets columns to the page defaults
// (field/milestone keys belong to the old template). `valid` =
// template set AND ≥1 column AND defs loaded; the FIRST onState fires
// unconditionally on mount (valid:false while defs load) per the
// shared.ts contract. The server (validate_block_config) remains the
// boundary validator.
import { useEffect, useMemo, useState } from "react"

import { type MetricCondition, type TableBlockConfig } from "@/api/views"
import {
  useFieldDefs,
  useMilestoneDefs,
  useTemplateList,
} from "@/api/templates"
import { Segmented } from "@/components/Segmented"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LIFECYCLE_STATES, lifecycleLabel } from "@/lib/lifecycle"
import {
  BUILTIN_KEYS,
  DEFAULT_COLUMNS,
  SORT_PARAM_BY_KEY,
  type FieldDefLite,
  type MilestoneDefLite,
  availableColumnsForTemplate,
  columnLabel,
  isBuiltIn,
} from "@/lib/view_columns"

import { ConditionsEditor } from "../ConditionsEditor"
import { fieldOptionsFor } from "../metricCatalog"

import type { SectionProps } from "./shared"

type Conditions = { combinator: "and" | "or"; items: MetricCondition[] }

function conditionsFromConfig(cfg: Partial<TableBlockConfig>): Conditions {
  const c = cfg.conditions
  if (c && Array.isArray(c.items)) {
    return {
      combinator: c.combinator === "or" ? "or" : "and",
      items: c.items,
    }
  }
  return { combinator: "and", items: [] }
}

const ALL = "__all__"
const NONE = "__none__"
const MAX_COLUMNS = 8
const LIMITS = ["6", "10", "15"] as const
type LimitChoice = (typeof LIMITS)[number]

export function TableConfigSection({ initialConfig, onState }: SectionProps) {
  const cfg = (initialConfig ?? {}) as Partial<TableBlockConfig>

  const [templateId, setTemplateId] = useState(
    typeof cfg.template_id === "string" ? cfg.template_id : "",
  )
  const [columns, setColumns] = useState<string[]>(() =>
    Array.isArray(cfg.columns) && cfg.columns.length > 0
      ? cfg.columns.filter((k): k is string => typeof k === "string")
      : DEFAULT_COLUMNS,
  )
  const [lifecycle, setLifecycle] = useState<string>(
    cfg.lifecycle_state ?? ALL,
  )
  const [q, setQ] = useState(typeof cfg.q === "string" ? cfg.q : "")
  const [limit, setLimit] = useState<LimitChoice>(
    cfg.limit === 10 || cfg.limit === 15 ? (String(cfg.limit) as LimitChoice) : "6",
  )
  const [sortKey, setSortKey] = useState<string>(
    cfg.sort && cfg.sort in SORT_PARAM_BY_KEY ? cfg.sort : NONE,
  )
  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    cfg.sort_direction === "desc" ? "desc" : "asc",
  )
  // Phase 7.18 — optional project field conditions on the chosen template.
  const [conditions, setConditions] = useState<Conditions>(() =>
    conditionsFromConfig(cfg),
  )

  const templates = useTemplateList()
  const fieldsQ = useFieldDefs(templateId || undefined)
  const milestonesQ = useMilestoneDefs(templateId || undefined)

  const fieldDefs: FieldDefLite[] = useMemo(
    () =>
      (fieldsQ.data?.items ?? []).map((fd) => ({
        id: fd.id,
        name: fd.name,
        field_type: fd.field_type,
      })),
    [fieldsQ.data],
  )
  const milestoneDefs: MilestoneDefLite[] = useMemo(
    () =>
      (milestonesQ.data?.items ?? []).map((md) => ({
        id: md.id,
        name: md.name,
        date_model: md.date_model as "single" | "planned_actual",
      })),
    [milestonesQ.data],
  )

  // Same option list as the page's ColumnPickerSheet, partitioned into
  // the three groups.
  const available = useMemo(
    () => availableColumnsForTemplate(fieldDefs, milestoneDefs),
    [fieldDefs, milestoneDefs],
  )
  const groups = [
    { name: "Built-ins", keys: available.filter(isBuiltIn) },
    {
      name: "Fields",
      keys: available.filter((k) => k.startsWith("custom_field:")),
    },
    {
      name: "Milestones",
      keys: available.filter((k) => k.startsWith("milestone:")),
    },
  ]

  // Phase 7.18 — condition field options for the chosen template:
  // project built-ins + this template's custom fields (date sub-fields
  // expanded), same catalog the metric builder uses. fieldOptionsFor
  // takes the raw FieldDef[] (not the column-grammar FieldDefLite).
  const conditionFieldOpts = useMemo(
    () => fieldOptionsFor("project", fieldsQ.data?.items ?? []),
    [fieldsQ.data],
  )

  const defsReady =
    !!templateId &&
    fieldsQ.data !== undefined &&
    milestonesQ.data !== undefined

  // 7.11 review carry-over (a): a stored config can hold keys that no
  // longer exist on the template (deleted field/milestone, changed
  // date_model). They're invisible in the picker but count against the
  // 8-cap and 422 on save — prune the draft to the available set once
  // defs load. Render-time adjustment (same pattern as the shell's
  // block reset); gated on defsReady so a loading fetch can never wipe
  // a valid draft. Built-ins are always available, so this never
  // touches them.
  if (defsReady && columns.some((k) => !available.includes(k))) {
    setColumns(columns.filter((k) => available.includes(k)))
  }

  const valid =
    defsReady && columns.length >= 1 && columns.length <= MAX_COLUMNS
  const hint = valid ? "" : " Pick a template and at least one column."

  useEffect(() => {
    const config: TableBlockConfig = {
      template_id: templateId,
      columns,
      lifecycle_state: lifecycle === ALL ? null : lifecycle,
      q: q.trim() ? q.trim() : null,
      // Omit conditions when empty (send null) so an empty draft never
      // trips the server's template_id-required check on the param.
      conditions: conditions.items.length > 0 ? conditions : null,
      limit: Number(limit) as TableBlockConfig["limit"],
      sort: sortKey === NONE ? null : sortKey,
      sort_direction: sortKey === NONE ? null : sortDir,
    }
    onState({
      config: config as unknown as Record<string, unknown>,
      valid,
      hint,
    })
    // onState is referentially stable (a setState in the shell).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    templateId,
    columns,
    lifecycle,
    q,
    limit,
    sortKey,
    sortDir,
    conditions,
    valid,
    hint,
  ])

  const pickTemplate = (id: string) => {
    if (id === templateId) return
    setTemplateId(id)
    // Field/milestone columns belong to the old template — reset to
    // the page's built-in defaults.
    setColumns(DEFAULT_COLUMNS)
    // Condition field refs belong to the old template too — clear them.
    setConditions({ combinator: "and", items: [] })
  }

  const toggleColumn = (key: string, checked: boolean) => {
    setColumns((cols) =>
      checked ? [...cols, key] : cols.filter((k) => k !== key),
    )
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="block-cfg-table-template">Template</Label>
        <Select
          value={templateId}
          onValueChange={pickTemplate}
          disabled={templates.isLoading}
        >
          <SelectTrigger id="block-cfg-table-template">
            <SelectValue placeholder="Pick a template…" />
          </SelectTrigger>
          <SelectContent>
            {(templates.data?.items ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          The table embeds one template's projects, like the Saved View
          page.
        </p>
      </div>

      {templateId && (
        <div className="space-y-1.5">
          <Label>Columns (1–{MAX_COLUMNS})</Label>
          {!defsReady ? (
            <p className="text-xs text-muted-foreground">Loading columns…</p>
          ) : (
            <div className="space-y-2 rounded-md border p-2">
              {groups.map(
                (g) =>
                  g.keys.length > 0 && (
                    <div key={g.name}>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        {g.name}
                      </p>
                      <div className="flex flex-col gap-1">
                        {g.keys.map((k) => {
                          const checked = columns.includes(k)
                          const label = columnLabel(
                            k,
                            fieldDefs,
                            milestoneDefs,
                          )
                          return (
                            <label
                              key={k}
                              className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/50"
                            >
                              <Checkbox
                                checked={checked}
                                disabled={
                                  !checked && columns.length >= MAX_COLUMNS
                                }
                                onCheckedChange={(v) =>
                                  toggleColumn(k, v === true)
                                }
                                aria-label={`${checked ? "Hide" : "Show"} ${label}`}
                              />
                              <span className="text-sm">{label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ),
              )}
            </div>
          )}
        </div>
      )}

      {templateId && defsReady && (
        <ConditionsEditor
          fieldOpts={conditionFieldOpts}
          conditions={conditions}
          onChange={setConditions}
          idPrefix="block-cfg-table-cond"
        />
      )}

      <div className="space-y-1.5">
        <Label htmlFor="block-cfg-table-lifecycle">Lifecycle</Label>
        <Select value={lifecycle} onValueChange={setLifecycle}>
          <SelectTrigger id="block-cfg-table-lifecycle">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All states</SelectItem>
            {LIFECYCLE_STATES.map((s) => (
              <SelectItem key={s} value={s}>
                {lifecycleLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="block-cfg-table-q">Search filter (optional)</Label>
        <Input
          id="block-cfg-table-q"
          maxLength={200}
          placeholder="Title, Project #, client #"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Rows shown</Label>
        <div>
          <Segmented<LimitChoice>
            aria-label="Rows shown"
            value={limit}
            onChange={setLimit}
            options={LIMITS.map((l) => ({ value: l, label: l }))}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="block-cfg-table-sort">Sort</Label>
        <div className="flex items-center gap-2">
          <Select value={sortKey} onValueChange={setSortKey}>
            <SelectTrigger id="block-cfg-table-sort" className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Default order</SelectItem>
              {BUILTIN_KEYS.map((k) => (
                <SelectItem key={k} value={k}>
                  {columnLabel(k, [], [])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {sortKey !== NONE && (
            <Segmented<"asc" | "desc">
              aria-label="Sort direction"
              value={sortDir}
              onChange={setSortDir}
              options={[
                { value: "asc", label: "Asc" },
                { value: "desc", label: "Desc" },
              ]}
            />
          )}
        </div>
      </div>
    </>
  )
}
