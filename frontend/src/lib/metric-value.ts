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
 * Unknown types fall through to a coerced-string render. Empty / null
 * values across every type render as the em-dash placeholder "—".
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
    case "auto_number": {
      const n = typeof value === "number" ? value : parseFloat(String(value))
      return isNaN(n) ? String(value) : n.toLocaleString()
    }
    case "percent": {
      const n = typeof value === "number" ? value : parseFloat(String(value))
      return isNaN(n) ? String(value) : `${n}%`
    }
    case "date":
    case "date_planned_actual":
      return formatDateLocal(String(value))
    case "boolean":
      return value === true || value === "true" ? "Yes" : "No"
    case "short_text":
    case "long_text":
    case "url":
    case "email":
    case "phone":
      return String(value)
    case "single_select":
      return String(value)
    case "multi_select":
      return Array.isArray(value) ? value.join(", ") : String(value)
    default:
      // user_picker_*, contact_picker, *_reference, date_range, duration,
      // boolean_conditional_* — fall back to a coerced string render.
      return typeof value === "string"
        ? value
        : Array.isArray(value)
          ? value.join(", ")
          : JSON.stringify(value)
  }
}
