/**
 * Metadata about the 8 form field types available in the form builder.
 * Mirrors the backend's field_type enum. The `getCompatibleTargets` helper
 * ports the same type-compatibility logic as backend/app/services/form_targets.py
 * so the "Maps to" dropdown only shows valid targets.
 */
import type {
  FieldTypeMap,
  FormTargetField,
  FormTargetsResponse,
} from "@/api/forms"

// ── Field type catalogue ──────────────────────────────────────────────────────

export type FieldTypeMeta = {
  type: string
  label: string
  /** Lucide icon name */
  icon: string
  /** Human hint shown in palette / config */
  desc: string
}

export const FIELD_TYPES: FieldTypeMeta[] = [
  { type: "short_text", label: "Short text",  icon: "Type",           desc: "Single line of text" },
  { type: "long_text",  label: "Long text",   icon: "AlignLeft",      desc: "Multi-line notes" },
  { type: "integer",    label: "Integer",     icon: "Hash",           desc: "Whole number" },
  { type: "decimal",    label: "Decimal",     icon: "Hash",           desc: "Decimal number" },
  { type: "currency",   label: "Currency",    icon: "DollarSign",     desc: "Dollar amount" },
  { type: "date",       label: "Date",        icon: "Calendar",       desc: "Calendar date" },
  { type: "single_select", label: "Dropdown", icon: "ChevronsUpDown", desc: "Pick from options" },
  { type: "boolean",    label: "Yes / No",    icon: "ToggleRight",    desc: "On / off switch" },
  { type: "user",       label: "User",        icon: "User",           desc: "Pick a person (e.g. an assignee)" },
]

export function fieldTypeMeta(type: string): FieldTypeMeta {
  return (
    FIELD_TYPES.find((f) => f.type === type) ?? {
      type,
      label: type,
      icon: "Type",
      desc: "",
    }
  )
}

// ── Compatibility ─────────────────────────────────────────────────────────────

/**
 * Whether a form field of `fieldType` can bind to a target of `targetType`,
 * derived from the backend's field_type_map (the single source of truth shipped
 * in the /targets payload — #49). Both sides are normalized through the same map.
 */
export function isCompatible(
  fieldType: string,
  targetType: string,
  fieldTypeMap: FieldTypeMap,
): boolean {
  const left = fieldTypeMap[fieldType]
  const right = fieldTypeMap[targetType] ?? targetType
  return left !== undefined && left === right
}

/**
 * Given a field type and the full targets payload, return the fields from the
 * given entity that are compatible with this field type.
 */
export function getCompatibleTargets(
  fieldType: string,
  entity: string | null,
  payload: FormTargetsResponse | undefined,
): FormTargetField[] {
  if (!entity || !payload) return []
  const descriptor = payload.targets[entity]
  if (!descriptor) return []
  return descriptor.fields.filter((tf) =>
    isCompatible(fieldType, tf.type, payload.field_type_map),
  )
}

/**
 * Whether a numeric form-field value is syntactically valid. Empty is treated
 * as valid (the required guard handles emptiness separately). Shared by the
 * fill-out form and the review flyout (Phase 18.5 DRY).
 */
export function isNumericValid(fieldType: string, value: string): boolean {
  const v = value.trim()
  if (v === "") return true
  if (fieldType === "integer") {
    return /^-?\d+$/.test(v)
  }
  if (fieldType === "decimal" || fieldType === "currency") {
    return /^-?\d*\.?\d+$/.test(v) && Number.isFinite(parseFloat(v))
  }
  return true
}
