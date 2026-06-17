// Display formatters for typed field values.
//
// USED FOR DISPLAY ONLY. Text inputs continue to bind to raw numbers —
// these formatters are not used in `FieldValueInput` or anywhere a user
// is typing into a number field.

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const PLAIN = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
})

export function formatCurrency(value: number | string): string {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return String(value)
  return USD.format(n)
}

// Percent values are stored as 0..100 (e.g. 42 means 42%), not as a
// fraction. Just append the symbol; show up to 2 decimal places.
export function formatPercent(value: number | string): string {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return String(value)
  return `${PLAIN.format(n)}%`
}

export function formatPlainNumber(value: number | string): string {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return String(value)
  return PLAIN.format(n)
}

/**
 * Format a custom-field value for display based on the field's type.
 * Returns null when the value should not be rendered (null/undefined/"").
 * For non-numeric types (or unknown), the raw value is stringified.
 */
export function formatFieldValue(
  value: unknown,
  fieldType: string | undefined,
): string | null {
  if (value === null || value === undefined || value === "") return null
  if (fieldType === "currency") return formatCurrency(value as number | string)
  if (fieldType === "percent") return formatPercent(value as number | string)
  if (
    fieldType === "integer" ||
    fieldType === "decimal" ||
    fieldType === "auto_number" ||
    fieldType === "duration"
  ) {
    return formatPlainNumber(value as number | string)
  }
  return String(value)
}
