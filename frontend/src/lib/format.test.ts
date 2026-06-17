import { describe, expect, it } from "vitest"

import {
  formatCurrency,
  formatFieldValue,
  formatPercent,
  formatPlainNumber,
} from "./format"

describe("formatCurrency", () => {
  it("formats whole numbers with cents", () => {
    expect(formatCurrency(12233)).toBe("$12,233.00")
  })
  it("formats decimals with two-digit precision", () => {
    expect(formatCurrency(12233.34)).toBe("$12,233.34")
  })
  it("accepts numeric strings", () => {
    expect(formatCurrency("12233.34")).toBe("$12,233.34")
  })
  it("rounds to two decimals", () => {
    // Note: Intl.NumberFormat uses the JS engine's default rounding —
    // float precision means 1.005 isn't exactly representable, so the
    // result depends on the runtime. Just check that the result is
    // shaped correctly.
    expect(formatCurrency(1.5)).toBe("$1.50")
    expect(formatCurrency(1.234)).toBe("$1.23")
    expect(formatCurrency(1.236)).toBe("$1.24")
  })
  it("falls back to the raw value for NaN", () => {
    expect(formatCurrency("not a number")).toBe("not a number")
  })
})

describe("formatPercent", () => {
  it("formats whole percent with the symbol appended", () => {
    expect(formatPercent(42)).toBe("42%")
  })
  it("formats fractional percent up to two decimals", () => {
    expect(formatPercent(42.5)).toBe("42.5%")
    expect(formatPercent(0.123)).toBe("0.12%")
  })
  it("does NOT divide by 100 (storage is already 0..100)", () => {
    expect(formatPercent(80)).toBe("80%")
  })
  it("falls back to the raw value for NaN", () => {
    expect(formatPercent("nope")).toBe("nope")
  })
})

describe("formatPlainNumber", () => {
  it("adds thousands separators", () => {
    expect(formatPlainNumber(1234567)).toBe("1,234,567")
  })
  it("keeps up to two decimal places", () => {
    expect(formatPlainNumber(1234.5)).toBe("1,234.5")
  })
})

describe("formatFieldValue", () => {
  it("returns null for null / undefined / empty string", () => {
    expect(formatFieldValue(null, "currency")).toBeNull()
    expect(formatFieldValue(undefined, "currency")).toBeNull()
    expect(formatFieldValue("", "currency")).toBeNull()
  })
  it("dispatches to formatCurrency for currency", () => {
    expect(formatFieldValue(12233.34, "currency")).toBe("$12,233.34")
  })
  it("dispatches to formatPercent for percent", () => {
    expect(formatFieldValue(42, "percent")).toBe("42%")
  })
  it("dispatches to formatPlainNumber for integer/decimal/auto_number/duration", () => {
    expect(formatFieldValue(1234, "integer")).toBe("1,234")
    expect(formatFieldValue(1234.5, "decimal")).toBe("1,234.5")
    expect(formatFieldValue(42, "auto_number")).toBe("42")
    expect(formatFieldValue(8, "duration")).toBe("8")
  })
  it("stringifies for unknown types", () => {
    expect(formatFieldValue("hello", "short_text")).toBe("hello")
    expect(formatFieldValue(true, "boolean")).toBe("true")
  })
})
