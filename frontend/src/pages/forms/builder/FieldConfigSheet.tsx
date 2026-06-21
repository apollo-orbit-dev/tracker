/**
 * FieldConfigSheet — right-flyout Sheet for editing a single form field.
 * Follows the "rare features behind a Sheet" convention from CLAUDE.md.
 *
 * Editable: label, type, required, placeholder, help_text, options (for
 * single_select), and a "Maps to" select filtered by type compatibility.
 */
import { useEffect, useState } from "react"
import { Trash2 } from "lucide-react"

// ── Stable-keyed row type for OptionsEditor (never leaves this file) ──────────
type ChoiceRow = { id: string; value: string }

function seedRows(choices: string[]): ChoiceRow[] {
  return choices.map((value) => ({ id: crypto.randomUUID(), value }))
}

function rowsToChoices(rows: ChoiceRow[]): string[] {
  return rows.map((r) => r.value)
}
import { toast } from "sonner"

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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  useFieldDelete,
  useFieldUpdate,
  useFormTargets,
  type FormField,
  type FormTargetField,
} from "@/api/forms"
import { useFieldDefs } from "@/api/templates"
import {
  FIELD_TYPES,
  getCompatibleTargets,
  isCompatible,
} from "@/pages/forms/formFieldMeta"

// ── Options editor for single_select ─────────────────────────────────────────
//
// Uses stable per-row ids (crypto.randomUUID) so React never re-uses a DOM
// input for a different choice after add/delete/reorder. The parent still
// receives and stores a plain `string[]`; `{ id, value }` objects never leave
// this component.

function OptionsEditor({
  choices,
  onChange,
}: {
  choices: string[]
  onChange: (next: string[]) => void
}) {
  // Internal state uses stable ids; seeded once on mount. The sheet is keyed by
  // field id at its call site, so a different field remounts this component and
  // re-seeds — we must NOT re-seed on `choices` content changes, or every
  // keystroke regenerates row ids and the focused input remounts (#3, Phase 21).
  const [rows, setRows] = useState<ChoiceRow[]>(() => seedRows(choices))

  function update(next: ChoiceRow[]) {
    setRows(next)
    onChange(rowsToChoices(next))
  }

  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-1.5">
          <Input
            value={row.value}
            onChange={(e) =>
              update(rows.map((r) => (r.id === row.id ? { ...r, value: e.target.value } : r)))
            }
            className="h-8 text-sm"
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={() => update(rows.filter((r) => r.id !== row.id))}
            aria-label="Remove option"
          >
            <Trash2 size={13} />
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs"
        onClick={() =>
          update([...rows, { id: crypto.randomUUID(), value: `Option ${rows.length + 1}` }])
        }
      >
        + Add option
      </Button>
    </div>
  )
}

// ── Sheet ─────────────────────────────────────────────────────────────────────

type Props = {
  formId: string
  field: FormField | null
  targetEntity: string | null
  /** Bound template for an intake form — surfaces its custom-field defs as
   * dynamic "Maps to" targets (Phase 20.5c). */
  targetTemplateId?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}

export function FieldConfigSheet({
  formId,
  field,
  targetEntity,
  targetTemplateId,
  open,
  onOpenChange,
  onDeleted,
}: Props) {
  const updateField = useFieldUpdate(formId)
  const deleteField = useFieldDelete(formId)
  const targetsQuery = useFormTargets()
  // Intake forms also bind to the chosen template's custom-field defs.
  const fieldDefsQuery = useFieldDefs(
    targetEntity === "intake" ? (targetTemplateId ?? undefined) : undefined,
  )

  // Local draft state — re-synced whenever the field prop changes
  const [label, setLabel] = useState(field?.label ?? "")
  const [fieldType, setFieldType] = useState(field?.field_type ?? "short_text")
  const [required, setRequired] = useState(field?.required ?? false)
  const [placeholder, setPlaceholder] = useState(field?.placeholder ?? "")
  const [helpText, setHelpText] = useState(field?.help_text ?? "")
  const [choices, setChoices] = useState<string[]>(
    field?.options?.choices ?? [],
  )
  const [targetKey, setTargetKey] = useState<string>(field?.target_key ?? "")

  useEffect(() => {
    if (!field) return
    setLabel(field.label)
    setFieldType(field.field_type)
    setRequired(field.required)
    setPlaceholder(field.placeholder ?? "")
    setHelpText(field.help_text ?? "")
    setChoices(field.options?.choices ?? [])
    setTargetKey(field.target_key ?? "")
  }, [field])

  if (!field) return null
  // TypeScript narrowing after early return doesn't carry into closures defined
  // below, so we reassign to a narrowed const here.
  const nonNullField = field

  const targetsData = targetsQuery.data
  const fieldTypeMap = targetsData?.field_type_map ?? {}
  // Intake's custom-field defs become dynamic, per-form targets (Phase 20.5c).
  const dynamicTargets: FormTargetField[] = (fieldDefsQuery.data?.items ?? []).map(
    (d) => ({ key: d.id, label: d.name, type: d.field_type, group: "Custom fields" }),
  )

  function compatibleFor(forType: string): FormTargetField[] {
    const staticTargets = getCompatibleTargets(forType, targetEntity, targetsData)
    const dyn = dynamicTargets.filter((t) =>
      isCompatible(forType, t.type, fieldTypeMap),
    )
    return [...staticTargets, ...dyn]
  }

  const compatibleTargets = compatibleFor(fieldType)

  // When field type changes, clear target_key if no longer compatible
  function handleTypeChange(newType: string) {
    setFieldType(newType)
    const stillCompatible = compatibleFor(newType)
    if (!stillCompatible.some((t) => t.key === targetKey)) {
      setTargetKey("")
    }
    if (newType === "single_select" && choices.length === 0) {
      setChoices(["Option 1", "Option 2"])
    }
  }

  const hasPlaceholder = ["short_text", "long_text", "integer", "decimal", "currency"].includes(
    fieldType,
  )

  function handleSave() {
    updateField.mutate(
      {
        id: nonNullField.id,
        label: label.trim() || nonNullField.label,
        field_type: fieldType,
        required,
        placeholder: placeholder.trim() || null,
        help_text: helpText.trim() || null,
        options: fieldType === "single_select" ? { choices } : null,
        target_key: targetKey || null,
      },
      {
        onSuccess: () => {
          onOpenChange(false)
        },
        onError: (err) => {
          toast.error(err.detail ?? "Failed to save field")
        },
      },
    )
  }

  function handleDelete() {
    deleteField.mutate(nonNullField.id, {
      onSuccess: () => {
        onOpenChange(false)
        onDeleted?.()
      },
      onError: (err) => {
        toast.error(err.detail ?? "Failed to delete field")
      },
    })
  }

  const isSaving = updateField.isPending
  const isDeleting = deleteField.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[380px] sm:max-w-[380px] overflow-y-auto">
        <SheetHeader className="pb-0">
          <SheetTitle>Edit field</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-4 py-4">
          {/* Field type */}
          <div className="space-y-1.5">
            <Label htmlFor="fc-type">Field type</Label>
            <Select value={fieldType} onValueChange={handleTypeChange}>
              <SelectTrigger id="fc-type" aria-label="Field type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((ft) => (
                  <SelectItem key={ft.type} value={ft.type}>
                    {ft.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <Label htmlFor="fc-label">Label</Label>
            <Input
              id="fc-label"
              value={label}
              maxLength={200}
              placeholder="Field label"
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          {/* Required toggle */}
          <div className="flex items-center gap-3">
            <Switch
              id="fc-required"
              checked={required}
              onCheckedChange={setRequired}
            />
            <Label htmlFor="fc-required" className="cursor-pointer">
              Required
            </Label>
          </div>

          {/* Placeholder (text / number types) */}
          {hasPlaceholder && (
            <div className="space-y-1.5">
              <Label htmlFor="fc-placeholder">
                Placeholder{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  optional
                </span>
              </Label>
              <Input
                id="fc-placeholder"
                value={placeholder}
                maxLength={200}
                placeholder="Shown when empty"
                onChange={(e) => setPlaceholder(e.target.value)}
              />
            </div>
          )}

          {/* Options (single_select only) */}
          {fieldType === "single_select" && (
            <div className="space-y-1.5">
              <Label>Options</Label>
              <OptionsEditor choices={choices} onChange={setChoices} />
            </div>
          )}

          {/* Maps to */}
          <div className="space-y-1.5">
            <Label htmlFor="fc-maps-to">
              Maps to{" "}
              <span className="text-xs text-muted-foreground font-normal">
                where this value is written on submit
              </span>
            </Label>
            <Select
              value={targetKey}
              onValueChange={(v) => setTargetKey(v === "__none" ? "" : v)}
            >
              <SelectTrigger id="fc-maps-to" aria-label="Maps to">
                <SelectValue placeholder="— Collect only (no mapping)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">
                  — Collect only (no mapping)
                </SelectItem>
                {compatibleTargets.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {compatibleTargets.length === 0 && targetEntity && (
              <p className="text-xs text-muted-foreground">
                No compatible targets for this field type.
              </p>
            )}
            {!targetEntity && (
              <p className="text-xs text-muted-foreground">
                Set a form target entity to enable field mapping.
              </p>
            )}
          </div>

          {/* Help text */}
          <div className="space-y-1.5">
            <Label htmlFor="fc-help">
              Help text{" "}
              <span className="text-xs text-muted-foreground font-normal">
                optional
              </span>
            </Label>
            <Textarea
              id="fc-help"
              value={helpText}
              rows={2}
              placeholder="Hint shown under the field"
              onChange={(e) => setHelpText(e.target.value)}
            />
          </div>
        </div>

        <SheetFooter className="flex-row justify-between gap-2 border-t pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 size={14} className="mr-1" />
            {isDeleting ? "Removing…" : "Remove field"}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving…" : "Done"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
