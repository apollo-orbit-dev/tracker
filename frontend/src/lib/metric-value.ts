// Phase 5.2 — format a custom_field_value for read-only display in the
// projects-list PeekPanel metric grid + the project detail right
// sidebar's Metrics block. Both consumers want the same per-type
// rendering, so the formatter lives here.

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === "string" && v.trim() === "") return true
  if (Array.isArray(v) && v.length === 0) return true
  return false
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n)
}

function formatDateLocal(iso: string): string {
  // Date-only ISO strings parse as UTC midnight which shifts west of
  // UTC. Anchor at local noon, same trick as PeekPanel's formatDate.
  const datePart = iso.length === 10 ? iso : iso.slice(0, 10)
  const d = new Date(datePart + "T12:00:00")
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/**
 * Format a `custom_field_values[fd.id]` payload for display.
 *
 * Used by the projects-list PeekPanel metric grid, the project-detail
 * right-sidebar Metrics block, and (Phase 25.3) the project-detail custom-
 * fields panel's read-only display. Every type renders to a human string;
 * empty / null values render as the em-dash placeholder "—".
 */
export function formatMetricValue(value: unknown, fieldType: string): string {
  if (isEmpty(value)) return "—"

  switch (fieldType) {
    case "currency": {
      const n = typeof value === "number" ? value : parseFloat(String(value))
      return isNaN(n) ? String(value) : formatCurrency(n)
    }
    case "integer":
    case "decimal":
    case "auto_number":
    case "duration": {
      const n = typeof value === "number" ? value : parseFloat(String(value))
      return isNaN(n) ? String(value) : n.toLocaleString()
    }
    case "percent": {
      const n = typeof value === "number" ? value : parseFloat(String(value))
      return isNaN(n) ? String(value) : `${n}%`
    }
    case "date":
      return formatDateLocal(String(value))
    case "date_planned_actual": {
      const v = value as { planned?: string | null; actual?: string | null }
      const parts: string[] = []
      if (v?.planned) parts.push(`Planned ${formatDateLocal(v.planned)}`)
      if (v?.actual) parts.push(`Actual ${formatDateLocal(v.actual)}`)
      return parts.length ? parts.join(" · ") : "—"
    }
    case "date_range": {
      const v = value as { start?: string | null; end?: string | null }
      if (!v?.start && !v?.end) return "—"
      return `${v.start ? formatDateLocal(v.start) : "…"} – ${
        v.end ? formatDateLocal(v.end) : "…"
      }`
    }
    case "boolean":
      return value === true || value === "true" ? "Yes" : "No"
    case "boolean_conditional_date": {
      const v = value as { value?: boolean; date?: string | null }
      if (!v?.value) return "No"
      return v.date ? `Yes · ${formatDateLocal(v.date)}` : "Yes"
    }
    case "boolean_conditional_text": {
      const v = value as { value?: boolean; text?: string | null }
      if (!v?.value) return "No"
      return v.text ? `Yes · ${v.text}` : "Yes"
    }
    case "short_text":
    case "long_text":
    case "url":
    case "email":
    case "phone":
    case "single_select":
      return String(value)
    case "multi_select":
      return Array.isArray(value) ? value.join(", ") : String(value)
    default:
      // user_picker_*, contact_picker, *_reference — coerced-string render
      // (UUIDs until proper name-resolving pickers ship).
      return typeof value === "string"
        ? value
        : Array.isArray(value)
          ? value.join(", ")
          : JSON.stringify(value)
  }
}

/** True when a custom-field value should render as the "—" / "Not set"
 *  placeholder. Exposed so the inline editor can branch on emptiness. */
export function isEmptyFieldValue(value: unknown): boolean {
  return isEmpty(value)
}
