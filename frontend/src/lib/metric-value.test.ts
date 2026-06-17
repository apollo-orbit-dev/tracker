import { describe, expect, it } from "vitest"

import { formatMetricValue } from "@/lib/metric-value"

describe("formatMetricValue", () => {
  it("renders em-dash for null / undefined / empty values", () => {
    expect(formatMetricValue(null, "short_text")).toBe("—")
    expect(formatMetricValue(undefined, "currency")).toBe("—")
    expect(formatMetricValue("", "short_text")).toBe("—")
    expect(formatMetricValue([], "multi_select")).toBe("—")
  })

  it("formats currency", () => {
    expect(formatMetricValue("12500", "currency")).toBe("$12,500")
    expect(formatMetricValue(750, "currency")).toBe("$750")
  })

  it("formats percent with trailing %", () => {
    expect(formatMetricValue(45, "percent")).toBe("45%")
    expect(formatMetricValue("75", "percent")).toBe("75%")
  })

  it("formats integers + decimals with locale grouping", () => {
    expect(formatMetricValue(1500, "integer")).toBe("1,500")
    expect(formatMetricValue("3.14", "decimal")).toBe("3.14")
  })

  it("formats dates anchored at local noon", () => {
    // YYYY-MM-DD parses as UTC midnight — the helper anchors at noon
    // so the displayed calendar day matches what was saved.
    expect(formatMetricValue("2026-12-31", "date")).toMatch(/Dec 31, 2026/)
  })

  it("formats boolean as Yes / No", () => {
    expect(formatMetricValue(true, "boolean")).toBe("Yes")
    expect(formatMetricValue(false, "boolean")).toBe("No")
    expect(formatMetricValue("true", "boolean")).toBe("Yes")
  })

  it("formats multi_select as comma-joined", () => {
    expect(formatMetricValue(["scoping", "design"], "multi_select")).toBe(
      "scoping, design",
    )
  })

  it("renders unknown types as a coerced string", () => {
    expect(formatMetricValue("foo", "user_picker_single")).toBe("foo")
    expect(formatMetricValue(["a", "b"], "user_picker_multi")).toBe("a, b")
  })
})
