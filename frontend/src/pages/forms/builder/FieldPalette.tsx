/**
 * FieldPalette — buttons for each field type that call useFieldCreate.
 * Rendered at the bottom of the Build panel's left pane.
 */
import { toast } from "sonner"
import * as LucideIcons from "lucide-react"

import { Button } from "@/components/ui/button"
import { FIELD_TYPES, type FieldTypeMeta } from "@/pages/forms/formFieldMeta"
import { useFieldCreate } from "@/api/forms"

type Props = {
  formId: string
  /** Called with the new field's id after successful creation. */
  onCreated?: (fieldId: string) => void
  /** Disabled on a published form (structure is locked). */
  disabled?: boolean
}

function PaletteButton({
  meta,
  onAdd,
  disabled,
}: {
  meta: FieldTypeMeta
  onAdd: () => void
  disabled?: boolean
}) {
  // Resolve lucide icon by name at runtime
  const IconComponent = (
    (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[meta.icon] ??
    LucideIcons.Type
  ) as React.ComponentType<{ size?: number; className?: string }>

  return (
    <Button
      variant="outline"
      size="sm"
      className="flex items-center gap-1.5 justify-start h-8 px-2 text-xs"
      onClick={onAdd}
      disabled={disabled}
      title={meta.desc}
    >
      <IconComponent size={13} className="shrink-0 text-[hsl(var(--primary))]" />
      {meta.label}
    </Button>
  )
}

export function FieldPalette({ formId, onCreated, disabled }: Props) {
  const create = useFieldCreate(formId)

  function handleAdd(meta: FieldTypeMeta) {
    const defaultLabel =
      meta.type === "currency"
        ? "Amount"
        : meta.type === "single_select"
          ? "Dropdown field"
          : meta.type === "boolean"
            ? "Yes / No question"
            : meta.label

    create.mutate(
      {
        label: defaultLabel,
        field_type: meta.type,
        required: false,
        options:
          meta.type === "single_select"
            ? { choices: ["Option 1", "Option 2"] }
            : null,
      },
      {
        onSuccess: (field) => {
          onCreated?.(field.id)
        },
        onError: (err) => {
          toast.error(err.detail ?? "Failed to add field")
        },
      },
    )
  }

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {FIELD_TYPES.map((meta) => (
        <PaletteButton
          key={meta.type}
          meta={meta}
          onAdd={() => handleAdd(meta)}
          disabled={disabled}
        />
      ))}
    </div>
  )
}
