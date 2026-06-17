import type { BadgeTone } from "@/components/Badge"

// Mirror of backend `backend/app/db/models.py::FIELD_TYPES`. Keep in sync
// with the migration's CHECK constraint and the Python frozenset.

export type FieldTypeGroup =
  | "Text"
  | "Number"
  | "Date"
  | "Choice"
  | "Boolean"
  | "Reference"

export type FieldTypeMeta = {
  value: string
  label: string
  group: FieldTypeGroup
}

export const FIELD_TYPES: ReadonlyArray<FieldTypeMeta> = [
  { value: "short_text", label: "Short text", group: "Text" },
  { value: "long_text", label: "Long text", group: "Text" },
  { value: "url", label: "URL", group: "Text" },
  { value: "email", label: "Email", group: "Text" },
  { value: "phone", label: "Phone", group: "Text" },
  { value: "integer", label: "Integer", group: "Number" },
  { value: "decimal", label: "Decimal", group: "Number" },
  { value: "currency", label: "Currency", group: "Number" },
  { value: "percent", label: "Percent", group: "Number" },
  { value: "auto_number", label: "Auto-number", group: "Number" },
  { value: "date", label: "Date", group: "Date" },
  { value: "date_planned_actual", label: "Date (planned + actual)", group: "Date" },
  { value: "date_range", label: "Date range", group: "Date" },
  { value: "duration", label: "Duration", group: "Date" },
  { value: "single_select", label: "Single select", group: "Choice" },
  { value: "multi_select", label: "Multi-select", group: "Choice" },
  { value: "boolean", label: "Boolean", group: "Boolean" },
  { value: "boolean_conditional_date", label: "Boolean → date", group: "Boolean" },
  { value: "boolean_conditional_text", label: "Boolean → text", group: "Boolean" },
  { value: "user_picker_single", label: "User picker (single)", group: "Reference" },
  { value: "user_picker_multi", label: "User picker (multi)", group: "Reference" },
  { value: "contact_picker", label: "Contact picker", group: "Reference" },
  { value: "project_reference", label: "Project reference", group: "Reference" },
  { value: "client_reference", label: "Client reference", group: "Reference" },
]

export const GROUPS: ReadonlyArray<FieldTypeGroup> = [
  "Text",
  "Number",
  "Date",
  "Choice",
  "Boolean",
  "Reference",
]

export const SELECT_TYPES = new Set<string>([
  "single_select",
  "multi_select",
])

export function isSelectType(t: string): boolean {
  return SELECT_TYPES.has(t)
}

export function fieldTypeLabel(value: string): string {
  return FIELD_TYPES.find((f) => f.value === value)?.label ?? value
}

export const MILESTONE_DIRECTIONS = [
  { value: "outbound", label: "Outbound (we deliver)" },
  { value: "inbound", label: "Inbound (we receive)" },
  { value: "internal", label: "Internal" },
  { value: "external", label: "External (reference)" },
] as const

export const MILESTONE_DATE_MODELS = [
  { value: "single", label: "Single date" },
  { value: "planned_actual", label: "Planned + actual" },
] as const

const GROUP_TONES: Record<FieldTypeGroup, BadgeTone> = {
  Text: "slate",
  Number: "blue",
  Date: "indigo",
  Choice: "indigo",
  Boolean: "amber",
  Reference: "indigo",
}

export function fieldTypeTone(value: string): BadgeTone {
  // `currency` sits in the Number group but the design ref calls it out as
  // emerald specifically — money-coloured. Honor that.
  if (value === "currency") return "emerald"
  const meta = FIELD_TYPES.find((f) => f.value === value)
  return meta ? GROUP_TONES[meta.group] : "slate"
}

const DIRECTION_TONES: Record<string, BadgeTone> = {
  outbound: "blue",
  inbound: "indigo",
  internal: "slate",
  external: "amber",
}

export function milestoneDirectionTone(value: string): BadgeTone {
  return DIRECTION_TONES[value] ?? "slate"
}
