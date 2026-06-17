/**
 * Column-key helpers for the per-template viewing list.
 *
 * The registry of built-in columns is constant. Custom-field and
 * milestone columns are derived from the template's field/milestone
 * defs. Keys use the same prefixed-string shape as the backend so
 * round-trips don't need a translation layer.
 */
export type ParsedKey =
  | { kind: "builtin"; name: string }
  | { kind: "custom_field"; id: string }
  | { kind: "milestone"; id: string; mode: "date" | "planned" | "actual" }

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/

const BUILTIN_NAMES = [
  "project_number",
  "client_number",
  "title",
  "lifecycle",
  "created_at",
  "updated_at",
] as const

export const BUILTIN_KEYS = BUILTIN_NAMES.map((n) => `builtin:${n}`)

const BUILTIN_LABELS: Record<string, string> = {
  project_number: "Project #",
  client_number: "Client #",
  title: "Title",
  lifecycle: "Status",
  created_at: "Created",
  updated_at: "Updated",
}

export const DEFAULT_COLUMNS: string[] = [
  "builtin:project_number",
  "builtin:title",
  "builtin:lifecycle",
]

export const DEFAULT_SORT = {
  sort_key: "builtin:created_at" as const,
  sort_direction: "desc" as const,
}

// Map column-key → backend sort param name (built-ins only). Shared by
// the viewing page and the embedded Saved View table block (7.11) so
// both speak the same `sort` dialect to GET /api/projects.
export const SORT_PARAM_BY_KEY: Record<string, string> = {
  "builtin:project_number": "project_number",
  "builtin:client_number": "client_number",
  "builtin:title": "title",
  "builtin:lifecycle": "lifecycle",
  "builtin:created_at": "created_at",
  "builtin:updated_at": "updated_at",
}

export function parseColumnKey(key: string): ParsedKey | null {
  if (key.startsWith("builtin:")) {
    const name = key.slice("builtin:".length)
    if (!(BUILTIN_NAMES as readonly string[]).includes(name)) return null
    return { kind: "builtin", name }
  }
  if (key.startsWith("custom_field:")) {
    const id = key.slice("custom_field:".length)
    if (!UUID.test(id)) {
      // Accept short synthetic IDs in tests too (alphanumerics + underscore,
      // no hyphens). Real IDs are always UUIDs and will match UUID above.
      if (!id || !/^[a-zA-Z0-9_]+$/.test(id)) return null
    }
    return { kind: "custom_field", id }
  }
  if (key.startsWith("milestone:")) {
    const rest = key.slice("milestone:".length)
    const lastColon = rest.lastIndexOf(":")
    if (lastColon < 0) return null
    const id = rest.slice(0, lastColon)
    const mode = rest.slice(lastColon + 1)
    if (mode !== "date" && mode !== "planned" && mode !== "actual") {
      return null
    }
    if (!id) return null
    return { kind: "milestone", id, mode }
  }
  return null
}

export function isBuiltIn(key: string): boolean {
  return key.startsWith("builtin:")
}

export function builtInLabel(name: string): string {
  return BUILTIN_LABELS[name] ?? name
}

export type FieldDefLite = {
  id: string
  name: string
  field_type: string
}

export type MilestoneDefLite = {
  id: string
  name: string
  date_model: "single" | "planned_actual"
}

/**
 * Returns the full list of column keys available for a template — the
 * union of built-ins, the template's live custom fields, and the
 * template's live milestone defs (split into planned/actual where
 * applicable).
 */
export function availableColumnsForTemplate(
  fieldDefs: FieldDefLite[],
  milestoneDefs: MilestoneDefLite[],
): string[] {
  const out: string[] = [...BUILTIN_KEYS]
  for (const fd of fieldDefs) {
    out.push(`custom_field:${fd.id}`)
  }
  for (const md of milestoneDefs) {
    if (md.date_model === "single") {
      out.push(`milestone:${md.id}:date`)
    } else {
      out.push(`milestone:${md.id}:planned`)
      out.push(`milestone:${md.id}:actual`)
    }
  }
  return out
}

export function columnLabel(
  key: string,
  fieldDefs: FieldDefLite[],
  milestoneDefs: MilestoneDefLite[],
): string {
  const parsed = parseColumnKey(key)
  if (parsed === null) return key
  if (parsed.kind === "builtin") {
    return builtInLabel(parsed.name)
  }
  if (parsed.kind === "custom_field") {
    const fd = fieldDefs.find((f) => f.id === parsed.id)
    return fd ? fd.name : "(removed field)"
  }
  const md = milestoneDefs.find((m) => m.id === parsed.id)
  if (!md) return "(removed milestone)"
  if (parsed.mode === "date") return md.name
  return `${md.name} — ${parsed.mode}`
}
