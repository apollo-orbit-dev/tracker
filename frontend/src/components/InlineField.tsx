import { Pencil } from "lucide-react"
import { forwardRef, useEffect, useRef, useState } from "react"

import { FieldValueInput } from "@/components/FieldValueInput"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { FieldDef } from "@/api/templates"
import { formatMetricValue, isEmptyFieldValue } from "@/lib/metric-value"

/**
 * Phase 25.3 — inline editor for one custom field on the project page.
 *
 * Two edit mechanisms, split to dodge Radix portal / blur hazards:
 *   - INLINE_TYPES (pure text / number / date inputs): click the value to
 *     edit in place; commit on blur or Enter, cancel on Escape.
 *   - everything else (selects, booleans, conditional booleans, date pairs,
 *     multi-select, reference pickers): click opens a Popover with the full
 *     `FieldValueInput` and explicit Cancel / Save — a single focusout can't
 *     reliably bracket these multi-control / portalled shapes.
 *   - `auto_number` is system-generated and renders read-only.
 *
 * The parent owns persistence via `onCommit` (it applies the required-field
 * guard and a no-op short-circuit). `onCommit` only fires when the draft
 * actually differs from the current value.
 */
const INLINE_TYPES = new Set([
  "short_text",
  "url",
  "email",
  "phone",
  "integer",
  "decimal",
  "currency",
  "percent",
  "duration",
  "date",
  "long_text",
])

type Props = {
  field: FieldDef
  value: unknown
  canEdit: boolean
  onCommit: (next: unknown) => void
}

const changed = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)

export function InlineField({ field, value, canEdit, onCommit }: Props) {
  const ft = field.field_type
  const readOnly = ft === "auto_number" || !canEdit
  const display = isEmptyFieldValue(value) ? null : formatMetricValue(value, ft)

  if (readOnly) {
    return (
      <div className="px-2 py-1.5 text-sm">
        {display ?? <span className="text-[hsl(var(--subtle-fg))]">Not set</span>}
      </div>
    )
  }

  if (INLINE_TYPES.has(ft)) {
    return <InlineTextEditor field={field} value={value} display={display} onCommit={onCommit} />
  }
  return <PopoverEditor field={field} value={value} display={display} onCommit={onCommit} />
}

const ValueButton = forwardRef<
  HTMLButtonElement,
  { display: string | null; onClick?: () => void }
>(({ display, onClick }, ref) => (
  <button
    ref={ref}
    type="button"
    onClick={onClick}
    className="group flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
  >
    <span
      className={
        display
          ? "min-w-0 break-words whitespace-pre-wrap"
          : "text-[hsl(var(--subtle-fg))]"
      }
    >
      {display ?? "Not set"}
    </span>
    <Pencil
      aria-hidden
      className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
    />
  </button>
))
ValueButton.displayName = "ValueButton"

function InlineTextEditor({
  field,
  value,
  display,
  onCommit,
}: {
  field: FieldDef
  value: unknown
  display: string | null
  onCommit: (next: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<unknown>(value)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editing) return
    const el = ref.current?.querySelector<HTMLElement>("input, textarea")
    el?.focus()
  }, [editing])

  if (!editing) {
    return (
      <ValueButton
        display={display}
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
      />
    )
  }

  const commit = () => {
    setEditing(false)
    if (changed(draft, value)) onCommit(draft)
  }
  const cancel = () => {
    setDraft(value)
    setEditing(false)
  }

  return (
    <div
      ref={ref}
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node | null)) commit()
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault()
          cancel()
        } else if (e.key === "Enter" && field.field_type !== "long_text") {
          e.preventDefault()
          commit()
        }
      }}
    >
      <FieldValueInput field={field} value={draft} onChange={setDraft} />
    </div>
  )
}

function PopoverEditor({
  field,
  value,
  display,
  onCommit,
}: {
  field: FieldDef
  value: unknown
  display: string | null
  onCommit: (next: unknown) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<unknown>(value)

  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])

  const save = () => {
    setOpen(false)
    if (changed(draft, value)) onCommit(draft)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ValueButton display={display} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground">
            {field.name}
          </div>
          <FieldValueInput field={field} value={draft} onChange={setDraft} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={save}>
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
