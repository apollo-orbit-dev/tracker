import { describe, expect, it } from "vitest"

import {
  ASSIGNMENT_STATUSES,
  assignmentStatusLabel,
} from "./assignment-status"

describe("assignment-status", () => {
  it("lists the four statuses in order", () => {
    expect(ASSIGNMENT_STATUSES).toEqual([
      "open",
      "in_progress",
      "done",
      "cancelled",
    ])
  })

  it("labels in_progress as 'In progress'", () => {
    expect(assignmentStatusLabel("in_progress")).toBe("In progress")
  })

  it("falls back to the raw value for unknown status", () => {
    expect(assignmentStatusLabel("weird")).toBe("weird")
  })
})
