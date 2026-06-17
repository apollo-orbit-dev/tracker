import { describe, expect, it } from "vitest"

import {
  milestoneOffsetLabel,
  milestoneOffsetTone,
} from "./milestones"

describe("milestoneOffsetTone", () => {
  it("past due → rose", () => {
    expect(milestoneOffsetTone(-1)).toBe("rose")
    expect(milestoneOffsetTone(-30)).toBe("rose")
  })
  it("today → amber", () => {
    expect(milestoneOffsetTone(0)).toBe("amber")
  })
  it("within a week → amber", () => {
    expect(milestoneOffsetTone(1)).toBe("amber")
    expect(milestoneOffsetTone(7)).toBe("amber")
  })
  it("more than a week out → slate", () => {
    expect(milestoneOffsetTone(8)).toBe("slate")
    expect(milestoneOffsetTone(60)).toBe("slate")
  })
})

describe("milestoneOffsetLabel", () => {
  it("formats past due with day count", () => {
    expect(milestoneOffsetLabel(-1)).toBe("1d overdue")
    expect(milestoneOffsetLabel(-12)).toBe("12d overdue")
  })
  it("Today for zero", () => {
    expect(milestoneOffsetLabel(0)).toBe("Today")
  })
  it("formats upcoming with day count", () => {
    expect(milestoneOffsetLabel(1)).toBe("in 1d")
    expect(milestoneOffsetLabel(45)).toBe("in 45d")
  })
})
