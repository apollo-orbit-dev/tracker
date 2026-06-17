/**
 * Type-aware input for one custom field value. Dispatches by `field_type`
 * to the appropriate UI primitive. Backend per-type validation (and the
 * DB-level CHECKs on the options invariant) are the source of truth; this
 * component is shape-only.
 *
 * Defaults for reference types are plain Inputs accepting UUID strings —
 * proper pickers (user/contact/project/client) ship in later phases.
 */
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { FieldDef } from "@/api/templates"

export type FieldValue = unknown

type Props = {
  field: FieldDef
  value: FieldValue
  onChange: (next: FieldValue) => void
  disabled?: boolean
}

function asStringOrEmpty(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function asNumberOrEmpty(v: unknown): string {
  return typeof v === "number" ? String(v) : ""
}

function asBool(v: unknown): boolean {
  return v === true
}

function emptyToNull(v: string): string | null {
  return v === "" ? null : v
}

function setKey<T extends object>(
  obj: T | null | undefined,
  key: keyof T,
  value: T[keyof T] | null,
): T {
  const base = (obj ?? {}) as T
  return { ...base, [key]: value } as T
}

export function FieldValueInput({ field, value, onChange, disabled }: Props) {
  const ft = field.field_type

  // ---- text family
  if (ft === "long_text") {
    return (
      <Textarea
        value={asStringOrEmpty(value)}
        onChange={(e) => onChange(emptyToNull(e.target.value))}
        disabled={disabled}
        rows={4}
      />
    )
  }
  if (ft === "short_text" || ft === "phone") {
    return (
      <Input
        value={asStringOrEmpty(value)}
        onChange={(e) => onChange(emptyToNull(e.target.value))}
        disabled={disabled}
        autoComplete="off"
      />
    )
  }
  if (ft === "url") {
    return (
      <Input
        type="url"
        value={asStringOrEmpty(value)}
        onChange={(e) => onChange(emptyToNull(e.target.value))}
        disabled={disabled}
        placeholder="https://…"
        autoComplete="off"
      />
    )
  }
  if (ft === "email") {
    return (
      <Input
        type="email"
        value={asStringOrEmpty(value)}
        onChange={(e) => onChange(emptyToNull(e.target.value))}
        disabled={disabled}
        autoComplete="off"
      />
    )
  }

  // ---- number family
  if (
    ft === "integer" ||
    ft === "decimal" ||
    ft === "currency" ||
    ft === "percent" ||
    ft === "auto_number" ||
    ft === "duration"
  ) {
    const step = ft === "integer" || ft === "auto_number" || ft === "duration" ? 1 : 0.01
    const min = ft === "percent" || ft === "duration" ? 0 : undefined
    const max = ft === "percent" ? 100 : undefined
    return (
      <Input
        type="number"
        step={step}
        min={min}
        max={max}
        value={asNumberOrEmpty(value)}
        onChange={(e) => {
          const s = e.target.value
          if (s === "") return onChange(null)
          const isInt = step === 1
          const n = isInt ? parseInt(s, 10) : parseFloat(s)
          onChange(Number.isFinite(n) ? n : null)
        }}
        disabled={disabled}
      />
    )
  }

  // ---- date family
  if (ft === "date") {
    return (
      <Input
        type="date"
        value={asStringOrEmpty(value)}
        onChange={(e) => onChange(emptyToNull(e.target.value))}
        disabled={disabled}
      />
    )
  }
  if (ft === "date_planned_actual") {
    const v = (value as { planned?: string | null; actual?: string | null }) ?? {}
    return (
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Planned</label>
          <Input
            type="date"
            value={v.planned ?? ""}
            onChange={(e) =>
              onChange(
                setKey(v, "planned", emptyToNull(e.target.value)),
              )
            }
            disabled={disabled}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Actual</label>
          <Input
            type="date"
            value={v.actual ?? ""}
            onChange={(e) =>
              onChange(
                setKey(v, "actual", emptyToNull(e.target.value)),
              )
            }
            disabled={disabled}
          />
        </div>
      </div>
    )
  }
  if (ft === "date_range") {
    const v = (value as { start?: string | null; end?: string | null }) ?? {}
    return (
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Start</label>
          <Input
            type="date"
            value={v.start ?? ""}
            onChange={(e) =>
              onChange(setKey(v, "start", emptyToNull(e.target.value)))
            }
            disabled={disabled}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">End</label>
          <Input
            type="date"
            value={v.end ?? ""}
            onChange={(e) =>
              onChange(setKey(v, "end", emptyToNull(e.target.value)))
            }
            disabled={disabled}
          />
        </div>
      </div>
    )
  }

  // ---- choice
  if (ft === "single_select") {
    const choices = field.options?.choices ?? []
    return (
      <Select
        value={asStringOrEmpty(value)}
        onValueChange={(v) => onChange(v === "" ? null : v)}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {choices.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  if (ft === "multi_select") {
    const choices = field.options?.choices ?? []
    const selected = Array.isArray(value) ? (value as string[]) : []
    const toggle = (c: string) => {
      if (selected.includes(c)) {
        onChange(selected.filter((x) => x !== c))
      } else {
        onChange([...selected, c])
      }
    }
    return (
      <div className="space-y-2">
        {choices.map((c) => (
          <label key={c} className="flex items-center gap-2">
            <Checkbox
              checked={selected.includes(c)}
              onCheckedChange={() => toggle(c)}
              disabled={disabled}
            />
            <span className="text-sm">{c}</span>
          </label>
        ))}
      </div>
    )
  }

  // ---- boolean family
  if (ft === "boolean") {
    return (
      <Checkbox
        checked={asBool(value)}
        onCheckedChange={(checked) => onChange(!!checked)}
        disabled={disabled}
      />
    )
  }
  if (ft === "boolean_conditional_date") {
    const v = (value as { value?: boolean; date?: string | null }) ?? {}
    return (
      <div className="space-y-2">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={!!v.value}
            onCheckedChange={(checked) =>
              onChange({ value: !!checked, date: checked ? (v.date ?? null) : null })
            }
            disabled={disabled}
          />
          <span className="text-sm">Yes</span>
        </label>
        {v.value && (
          <Input
            type="date"
            value={v.date ?? ""}
            onChange={(e) =>
              onChange({ value: true, date: emptyToNull(e.target.value) })
            }
            disabled={disabled}
          />
        )}
      </div>
    )
  }
  if (ft === "boolean_conditional_text") {
    const v = (value as { value?: boolean; text?: string | null }) ?? {}
    return (
      <div className="space-y-2">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={!!v.value}
            onCheckedChange={(checked) =>
              onChange({ value: !!checked, text: checked ? (v.text ?? null) : null })
            }
            disabled={disabled}
          />
          <span className="text-sm">Yes</span>
        </label>
        {v.value && (
          <Input
            value={v.text ?? ""}
            onChange={(e) =>
              onChange({ value: true, text: emptyToNull(e.target.value) })
            }
            disabled={disabled}
            placeholder="Details"
            autoComplete="off"
          />
        )}
      </div>
    )
  }

  // ---- reference family — UUID-string Inputs until proper pickers ship.
  if (ft === "user_picker_single" || ft === "contact_picker" || ft === "project_reference" || ft === "client_reference") {
    return (
      <Input
        value={asStringOrEmpty(value)}
        onChange={(e) => onChange(emptyToNull(e.target.value))}
        disabled={disabled}
        placeholder="00000000-0000-0000-0000-000000000000"
        autoComplete="off"
      />
    )
  }
  if (ft === "user_picker_multi") {
    const arr = Array.isArray(value) ? (value as string[]) : []
    return (
      <Textarea
        value={arr.join("\n")}
        onChange={(e) => {
          const lines = e.target.value
            .split("\n")
            .map((s) => s.trim())
            .filter((s) => s !== "")
          onChange(lines)
        }}
        disabled={disabled}
        placeholder="One UUID per line"
        rows={3}
      />
    )
  }

  // Fallback for any unknown type — render a plain text input.
  return (
    <Input
      value={asStringOrEmpty(value)}
      onChange={(e) => onChange(emptyToNull(e.target.value))}
      disabled={disabled}
    />
  )
}
