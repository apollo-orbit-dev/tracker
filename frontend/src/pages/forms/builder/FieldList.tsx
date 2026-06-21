/**
 * FieldList — ordered list of form fields with up/down reorder buttons,
 * a type icon, a binding chip, and a click to open FieldConfigSheet.
 *
 * NOTE: Uses up/down buttons rather than dnd-kit drag-to-reorder. The
 * @dnd-kit/sortable package is available in package.json, but since this
 * is the first usage in the codebase and there are no existing patterns to
 * follow, up/down buttons were chosen to avoid introducing complex drag
 * setup that would be hard to test. A drag upgrade is tracked in open_items.
 */
import * as LucideIcons from "lucide-react"
import { ArrowUp, ArrowDown, Settings2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/ui/button"
import { fieldTypeMeta } from "@/pages/forms/formFieldMeta"
import { useFieldReorder, useFormTargets, type Form, type FormField } from "@/api/forms"
import { useFieldDefs } from "@/api/templates"

type Props = {
  form: Form
  selectedFieldId: string | null
  onSelectField: (id: string) => void
  /** Published forms are read-only: no opening the config sheet, no reorder. */
  readOnly?: boolean
}

function BindingChip({ label }: { label: string | null }) {
  if (!label) {
    return (
      <span className="text-xs text-muted-foreground italic">unmapped</span>
    )
  }
  return <Badge tone="blue">{label}</Badge>
}

function FieldRow({
  field,
  index,
  total,
  isSelected,
  onSelect,
  onMoveUp,
  onMoveDown,
  readOnly = false,
  bindingLabel,
}: {
  field: FormField
  index: number
  total: number
  isSelected: boolean
  onSelect: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  readOnly?: boolean
  bindingLabel: string | null
}) {
  const meta = fieldTypeMeta(field.field_type)
  const IconComponent = (
    (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[meta.icon] ??
    LucideIcons.Type
  ) as React.ComponentType<{ size?: number; className?: string }>

  return (
    <div
      className={[
        "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
        readOnly ? "bg-background" : "cursor-pointer",
        !readOnly && isSelected
          ? "border-primary bg-primary/5"
          : !readOnly
            ? "bg-background hover:bg-[hsl(var(--row-hover))]"
            : "",
      ].join(" ")}
      onClick={readOnly ? undefined : onSelect}
      role="option"
      aria-selected={isSelected}
    >
      {/* Type icon */}
      <IconComponent
        size={14}
        className="shrink-0 text-muted-foreground"
      />

      {/* Label */}
      <span className="flex-1 truncate font-medium">
        {field.label || "Untitled field"}
        {field.required && (
          <span className="ml-0.5 text-destructive">*</span>
        )}
      </span>

      {/* Binding chip */}
      <BindingChip label={bindingLabel} />

      {/* Reorder + config affordances — hidden on a published (read-only) form */}
      {!readOnly && (
        <>
          <div className="flex gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              disabled={index === 0}
              onClick={onMoveUp}
              aria-label="Move field up"
            >
              <ArrowUp size={12} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              disabled={index === total - 1}
              onClick={onMoveDown}
              aria-label="Move field down"
            >
              <ArrowDown size={12} />
            </Button>
          </div>
          <Settings2 size={13} className="shrink-0 text-muted-foreground" />
        </>
      )}
    </div>
  )
}

export function FieldList({ form, selectedFieldId, onSelectField, readOnly = false }: Props) {
  const reorder = useFieldReorder(form.id)

  // Resolve a field's target_key → human label. Static targets come from the
  // registry; intake's custom-field targets (target_key = template def id) come
  // from the bound template, so a mapped intake field shows the def name rather
  // than its UUID (Phase 21.4).
  const { data: formTargets } = useFormTargets()
  const { data: fieldDefs } = useFieldDefs(
    form.target_entity === "intake" ? (form.target_template_id ?? undefined) : undefined,
  )
  const labelByKey = new Map<string, string>()
  const descriptor = form.target_entity
    ? formTargets?.targets[form.target_entity]
    : undefined
  for (const f of descriptor?.fields ?? []) labelByKey.set(f.key, f.label)
  for (const d of fieldDefs?.items ?? []) labelByKey.set(d.id, d.name)
  const labelFor = (key: string | null) =>
    key ? (labelByKey.get(key) ?? key) : null

  const liveFields = [...form.fields].sort(
    (a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at),
  )

  function move(fromIdx: number, toIdx: number) {
    if (toIdx < 0 || toIdx >= liveFields.length) return
    const ids = liveFields.map((f) => f.id)
    const [moved] = ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, moved)
    reorder.mutate(
      { field_ids: ids },
      {
        onError: (err) => toast.error(err.detail ?? "Reorder failed"),
      },
    )
  }

  if (liveFields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No fields yet — add one below.
      </p>
    )
  }

  return (
    <div className="space-y-1.5" role="listbox" aria-label="Form fields">
      {liveFields.map((field, index) => (
        <FieldRow
          key={field.id}
          field={field}
          index={index}
          total={liveFields.length}
          isSelected={selectedFieldId === field.id}
          onSelect={() => onSelectField(field.id)}
          onMoveUp={() => move(index, index - 1)}
          onMoveDown={() => move(index, index + 1)}
          readOnly={readOnly}
          bindingLabel={labelFor(field.target_key)}
        />
      ))}
    </div>
  )
}
