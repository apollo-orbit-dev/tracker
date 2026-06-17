// Phase 7.18 — the reusable conditions UI, extracted verbatim from
// MetricBuilder (behavior-frozen). Owns the "Conditions" label + AND/OR
// Segmented (shown at ≥2 items) + the list of ConditionRow (each using
// ConditionValue) + the capped "Add condition" button. Both the metric
// builder and the embedded table block's config section render this so
// there is ONE condition-row implementation and one no-value-op source.
//
// Nothing is evaluated client-side; the catalogs (OPS_BY_KIND,
// NO_VALUE_DATE_OPS) mirror backend/app/services/metric_engine.py and the
// server (validate_metric / compile_project_conditions) stays the boundary
// validator. See metricCatalog.ts's header.
import { Plus, X } from "lucide-react"

import { type MetricCondition } from "@/api/views"
import { Segmented } from "@/components/Segmented"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  type FieldOption,
  NO_VALUE_DATE_OPS,
  OPS_BY_KIND,
  isFiniteNumber,
} from "./metricCatalog"

const MAX_CONDITIONS = 10

type Conditions = { combinator: "and" | "or"; items: MetricCondition[] }

type Props = {
  fieldOpts: FieldOption[]
  conditions: Conditions
  onChange: (next: Conditions) => void
  /** Prefix kept for parity with the builder's labeled-id convention;
   *  the conditions rows label via aria-label, so it is currently unused
   *  by the markup but threaded for future per-row ids. */
  idPrefix: string
}

export function ConditionsEditor({ fieldOpts, conditions, onChange }: Props) {
  const byRef = new Map(fieldOpts.map((o) => [o.ref, o]))

  const setItems = (items: MetricCondition[]) =>
    onChange({ combinator: conditions.combinator, items })

  const updateItem = (idx: number, next: MetricCondition) =>
    setItems(conditions.items.map((c, i) => (i === idx ? next : c)))

  const addCondition = () => {
    const first = fieldOpts[0]
    if (!first) return
    setItems([
      ...conditions.items,
      { field: first.ref, op: OPS_BY_KIND[first.kind][0].value },
    ])
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Conditions</Label>
        {conditions.items.length >= 2 && (
          <Segmented<"and" | "or">
            aria-label="Combine conditions with"
            value={conditions.combinator}
            onChange={(combinator) =>
              onChange({ combinator, items: conditions.items })
            }
            options={[
              { value: "and", label: "AND" },
              { value: "or", label: "OR" },
            ]}
          />
        )}
      </div>
      {conditions.items.map((c, i) => (
        <ConditionRow
          key={i}
          idx={i}
          cond={c}
          fieldOpts={fieldOpts}
          field={byRef.get(c.field)}
          onChange={(next) => updateItem(i, next)}
          onRemove={() => setItems(conditions.items.filter((_, j) => j !== i))}
        />
      ))}
      {conditions.items.length < MAX_CONDITIONS && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addCondition}
          disabled={fieldOpts.length === 0}
        >
          <Plus className="mr-1 size-3.5" /> Add condition
        </Button>
      )}
    </div>
  )
}

// ---- condition row ---------------------------------------------------------

function ConditionRow({
  idx,
  cond,
  fieldOpts,
  field,
  onChange,
  onRemove,
}: {
  idx: number
  cond: MetricCondition
  fieldOpts: FieldOption[]
  field: FieldOption | undefined
  onChange: (next: MetricCondition) => void
  onRemove: () => void
}) {
  const kind = field?.kind
  return (
    <div className="space-y-1.5 rounded-md border p-2">
      <div className="flex items-center gap-1.5">
        <Select
          value={field ? cond.field : ""}
          onValueChange={(ref) => {
            const f = fieldOpts.find((o) => o.ref === ref)
            if (!f) return
            onChange({ field: ref, op: OPS_BY_KIND[f.kind][0].value })
          }}
        >
          <SelectTrigger
            className="h-8 flex-1 text-xs"
            aria-label={`Condition ${idx + 1} field`}
          >
            <SelectValue placeholder="Field…" />
          </SelectTrigger>
          <SelectContent>
            {fieldOpts.map((f) => (
              <SelectItem key={f.ref} value={f.ref}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={kind ? cond.op : ""}
          onValueChange={(op) => onChange({ field: cond.field, op })}
          disabled={!kind}
        >
          <SelectTrigger
            className="h-8 w-[40%] text-xs"
            aria-label={`Condition ${idx + 1} operator`}
          >
            <SelectValue placeholder="Op…" />
          </SelectTrigger>
          <SelectContent>
            {(kind ? OPS_BY_KIND[kind] : []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={`Remove condition ${idx + 1}`}
          onClick={onRemove}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      {field && <ConditionValue cond={cond} field={field} onChange={onChange} />}
    </div>
  )
}

function ConditionValue({
  cond,
  field,
  onChange,
}: {
  cond: MetricCondition
  field: FieldOption
  onChange: (next: MetricCondition) => void
}) {
  const { op } = cond
  // Ops that carry no value at all (NO_VALUE_DATE_OPS is the single
  // source shared with valueProblems — see metricCatalog.ts).
  if (
    field.kind === "boolean" ||
    op === "is_empty" ||
    (field.kind === "date" && NO_VALUE_DATE_OPS.has(op))
  ) {
    return null
  }

  if (field.kind === "select") {
    const picked = Array.isArray(cond.value) ? (cond.value as string[]) : []
    const choices = field.choices ?? []
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full justify-start text-xs font-normal"
          >
            {picked.length > 0
              ? `${picked.length} selected`
              : "Pick at least one value…"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {choices.length === 0 && (
              <p className="text-xs text-muted-foreground">
                This field has no options.
              </p>
            )}
            {choices.map((choice) => (
              <label
                key={choice}
                className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted"
              >
                <Checkbox
                  checked={picked.includes(choice)}
                  onCheckedChange={(checked) => {
                    const next =
                      checked === true
                        ? [...picked, choice]
                        : picked.filter((x) => x !== choice)
                    onChange({ ...cond, value: next })
                  }}
                />
                {choice}
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  if (field.kind === "number") {
    if (op === "between") {
      const pair = Array.isArray(cond.value) ? cond.value : [undefined, undefined]
      const setAt = (i: 0 | 1, raw: string) => {
        const next = [pair[0], pair[1]]
        next[i] = raw === "" ? undefined : Number(raw)
        onChange({ ...cond, value: next })
      }
      return (
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            className="h-8 text-xs"
            aria-label="Low"
            placeholder="Low"
            value={isFiniteNumber(pair[0]) ? String(pair[0]) : ""}
            onChange={(e) => setAt(0, e.target.value)}
          />
          <Input
            type="number"
            className="h-8 text-xs"
            aria-label="High"
            placeholder="High"
            value={isFiniteNumber(pair[1]) ? String(pair[1]) : ""}
            onChange={(e) => setAt(1, e.target.value)}
          />
        </div>
      )
    }
    return (
      <Input
        type="number"
        className="h-8 text-xs"
        aria-label="Value"
        placeholder="Value"
        value={isFiniteNumber(cond.value) ? String(cond.value) : ""}
        onChange={(e) =>
          onChange({
            ...cond,
            value: e.target.value === "" ? undefined : Number(e.target.value),
          })
        }
      />
    )
  }

  if (field.kind === "date") {
    if (op === "last_n_days" || op === "next_n_days") {
      return (
        <Input
          type="number"
          min={1}
          max={730}
          className="h-8 text-xs"
          aria-label="Days"
          placeholder="Days (1–730)"
          value={typeof cond.value === "number" ? String(cond.value) : ""}
          onChange={(e) =>
            onChange({
              ...cond,
              value: e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
        />
      )
    }
    if (op === "between") {
      const pair = Array.isArray(cond.value) ? cond.value : ["", ""]
      const setAt = (i: 0 | 1, raw: string) => {
        const next = [pair[0] ?? "", pair[1] ?? ""]
        next[i] = raw
        onChange({ ...cond, value: next })
      }
      return (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            className="h-8 text-xs"
            aria-label="Start date"
            value={typeof pair[0] === "string" ? pair[0] : ""}
            onChange={(e) => setAt(0, e.target.value)}
          />
          <Input
            type="date"
            className="h-8 text-xs"
            aria-label="End date"
            value={typeof pair[1] === "string" ? pair[1] : ""}
            onChange={(e) => setAt(1, e.target.value)}
          />
        </div>
      )
    }
    return (
      <Input
        type="date"
        className="h-8 text-xs"
        aria-label="Date"
        value={typeof cond.value === "string" ? cond.value : ""}
        onChange={(e) =>
          onChange({ ...cond, value: e.target.value || undefined })
        }
      />
    )
  }

  // text
  return (
    <Input
      type="text"
      maxLength={200}
      className="h-8 text-xs"
      aria-label="Text value"
      placeholder="Text…"
      value={typeof cond.value === "string" ? cond.value : ""}
      onChange={(e) =>
        onChange({ ...cond, value: e.target.value || undefined })
      }
    />
  )
}
