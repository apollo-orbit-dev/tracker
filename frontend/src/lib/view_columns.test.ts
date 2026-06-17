import { describe, expect, it } from "vitest"

import {
  DEFAULT_COLUMNS,
  DEFAULT_SORT,
  availableColumnsForTemplate,
  columnLabel,
  isBuiltIn,
  parseColumnKey,
} from "./view_columns"

describe("parseColumnKey", () => {
  it("parses builtin keys", () => {
    expect(parseColumnKey("builtin:title")).toEqual({
      kind: "builtin",
      name: "title",
    })
  })
  it("parses custom_field keys", () => {
    const id = "11111111-1111-1111-1111-111111111111"
    expect(parseColumnKey(`custom_field:${id}`)).toEqual({
      kind: "custom_field",
      id,
    })
  })
  it("parses milestone single-date", () => {
    const id = "22222222-2222-2222-2222-222222222222"
    expect(parseColumnKey(`milestone:${id}:date`)).toEqual({
      kind: "milestone",
      id,
      mode: "date",
    })
  })
  it("parses milestone planned/actual", () => {
    const id = "33333333-3333-3333-3333-333333333333"
    expect(parseColumnKey(`milestone:${id}:planned`)?.mode).toBe("planned")
    expect(parseColumnKey(`milestone:${id}:actual`)?.mode).toBe("actual")
  })
  it("returns null on garbage", () => {
    expect(parseColumnKey("garbage")).toBeNull()
    expect(parseColumnKey("custom_field:not-uuid")).toBeNull()
  })
})

describe("availableColumnsForTemplate", () => {
  const fieldDefs = [
    { id: "f1", name: "Owner", field_type: "user_picker_single" },
  ]
  const milestoneDefs = [
    { id: "m1", name: "Kickoff", date_model: "single" as const },
    { id: "m2", name: "Final Plans", date_model: "planned_actual" as const },
  ]

  it("includes built-ins, custom fields, single and planned_actual milestones", () => {
    const keys = availableColumnsForTemplate(fieldDefs, milestoneDefs)
    expect(keys).toContain("builtin:title")
    expect(keys).toContain("custom_field:f1")
    expect(keys).toContain("milestone:m1:date")
    expect(keys).toContain("milestone:m2:planned")
    expect(keys).toContain("milestone:m2:actual")
    expect(keys).not.toContain("milestone:m2:date")
    expect(keys).not.toContain("milestone:m1:planned")
  })
})

describe("DEFAULT_COLUMNS", () => {
  it("is the spec's starter set", () => {
    expect(DEFAULT_COLUMNS).toEqual([
      "builtin:project_number",
      "builtin:title",
      "builtin:lifecycle",
    ])
  })
})

describe("DEFAULT_SORT", () => {
  it("is created_at DESC", () => {
    expect(DEFAULT_SORT).toEqual({
      sort_key: "builtin:created_at",
      sort_direction: "desc",
    })
  })
})

describe("isBuiltIn", () => {
  it("returns true for builtin keys", () => {
    expect(isBuiltIn("builtin:title")).toBe(true)
  })
  it("returns false for everything else", () => {
    expect(isBuiltIn("custom_field:x")).toBe(false)
    expect(isBuiltIn("milestone:y:date")).toBe(false)
  })
})

describe("columnLabel", () => {
  it("labels built-ins", () => {
    expect(columnLabel("builtin:title", [], [])).toBe("Title")
    expect(columnLabel("builtin:project_number", [], [])).toBe("Project #")
  })
  it("labels custom fields by name", () => {
    const fd = [{ id: "f1", name: "Owner", field_type: "user_picker_single" }]
    expect(columnLabel("custom_field:f1", fd, [])).toBe("Owner")
  })
  it("labels milestones by name + mode", () => {
    const md = [
      { id: "m1", name: "Kickoff", date_model: "single" as const },
      { id: "m2", name: "Final Plans", date_model: "planned_actual" as const },
    ]
    expect(columnLabel("milestone:m1:date", [], md)).toBe("Kickoff")
    expect(columnLabel("milestone:m2:planned", [], md)).toBe(
      "Final Plans — planned",
    )
    expect(columnLabel("milestone:m2:actual", [], md)).toBe(
      "Final Plans — actual",
    )
  })
  it("falls back gracefully on orphans", () => {
    expect(columnLabel("custom_field:dead", [], [])).toBe("(removed field)")
    expect(columnLabel("milestone:dead:date", [], [])).toBe(
      "(removed milestone)",
    )
  })
})
