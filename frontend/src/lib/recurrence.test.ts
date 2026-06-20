import { describe, expect, it } from "vitest"
import { recurrenceSummary } from "./recurrence"

describe("recurrenceSummary", () => {
  it("describes every-other-Monday", () => {
    expect(recurrenceSummary({ freq: "weekly", interval: 2, byweekday: [0], end: { mode: "never" } }))
      .toMatch(/every 2 weeks on Mon/i)
  })
  it("describes first-Monday-of-month", () => {
    expect(recurrenceSummary({ freq: "monthly", interval: 1, monthly_mode: "nth_weekday",
      bysetpos: 1, byweekday_nth: 0, end: { mode: "count", count: 3 } }))
      .toMatch(/monthly on the 1st Mon.*3 times/i)
  })
})
