import { describe, expect, it } from "vitest"
import { calendarItemColor, calendarItemKey, calendarItemLabel } from "./calendar-format"
import type { CalendarItem } from "@/api/calendar"

const ms: CalendarItem = {
  type: "milestone", id: "m1", date: "2026-07-10", name: "Submit",
  direction: "outbound", completed: false, actual_date: null,
  project_id: "p1", project_title: "Proj",
}

describe("calendar-format", () => {
  it("keys by type+id", () => {
    expect(calendarItemKey(ms)).toBe("milestone:m1")
  })
  it("labels a milestone by name", () => {
    expect(calendarItemLabel(ms)).toBe("Submit")
  })
  it("mutes completed milestones", () => {
    expect(calendarItemColor({ ...ms, completed: true })).toContain("line-through")
  })
})
