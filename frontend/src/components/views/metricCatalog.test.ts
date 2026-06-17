// Phase 7.8 — catalog expansion (open item 28, frontend half) + the
// shared value formatter (open item 24).
import { describe, expect, it } from "vitest"

import { fieldOptionsFor, formatValue } from "./metricCatalog"
import type { FieldDef } from "@/api/templates"

const fd = (id: string, name: string, field_type: string): FieldDef => ({
  id,
  template_id: "t1",
  name,
  field_type,
  required: false,
  is_project_metric: false,
  order_index: 0,
  options: null,
  created_at: "",
  updated_at: "",
})

describe("fieldOptionsFor — Phase 7.8 field expansion", () => {
  it("expands date_planned_actual into exactly two date sub-options, no bare-uuid option", () => {
    const opts = fieldOptionsFor("project", [
      fd("f-dpa", "Design dates", "date_planned_actual"),
    ])
    expect(opts).toContainEqual({
      ref: "f-dpa.planned",
      label: "Design dates (planned)",
      kind: "date",
      choices: null,
    })
    expect(opts).toContainEqual({
      ref: "f-dpa.actual",
      label: "Design dates (actual)",
      kind: "date",
      choices: null,
    })
    expect(opts.some((o) => o.ref === "f-dpa")).toBe(false)
  })

  it("expands date_range into (start)/(end) sub-options, no bare-uuid option", () => {
    const opts = fieldOptionsFor("project", [
      fd("f-dr", "Outage window", "date_range"),
    ])
    expect(opts.filter((o) => o.ref.startsWith("f-dr"))).toEqual([
      { ref: "f-dr.start", label: "Outage window (start)", kind: "date", choices: null },
      { ref: "f-dr.end", label: "Outage window (end)", kind: "date", choices: null },
    ])
  })

  it("maps url/email/phone to kind text", () => {
    const opts = fieldOptionsFor("project", [
      fd("f-url", "Site", "url"),
      fd("f-email", "PM email", "email"),
      fd("f-phone", "PM phone", "phone"),
    ])
    for (const ref of ["f-url", "f-email", "f-phone"]) {
      expect(opts.find((o) => o.ref === ref)?.kind).toBe("text")
    }
  })
})

describe("formatValue — the one shared value formatter", () => {
  it("renders null as an em dash", () => {
    expect(formatValue(null, {})).toBe("—")
  })
  it("appends % for pct and ignores the money flag", () => {
    expect(formatValue("25", { pct: true, money: true })).toBe("25%")
    expect(formatValue("42.5", { pct: true })).toBe("42.5%")
  })
  it("formats money, compacting only at >= 100k", () => {
    expect(formatValue("350000", { money: true })).toBe("$350,000")
    expect(formatValue("250000", { money: true, compact: true })).toBe("$250k")
    expect(formatValue("9500", { money: true, compact: true })).toBe("$9,500")
  })
  it("locale-formats plain numbers", () => {
    expect(formatValue("1234", {})).toBe("1,234")
  })
})
