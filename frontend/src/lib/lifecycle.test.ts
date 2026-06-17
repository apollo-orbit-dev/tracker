import { describe, expect, it } from "vitest"

import { lifecycleLabel, lifecycleTone } from "./lifecycle"

describe("lifecycleLabel", () => {
  it("returns the human label for each known state", () => {
    expect(lifecycleLabel("draft")).toBe("Draft")
    expect(lifecycleLabel("active")).toBe("Active")
    expect(lifecycleLabel("on_hold")).toBe("On hold")
    expect(lifecycleLabel("complete")).toBe("Complete")
    expect(lifecycleLabel("cancelled")).toBe("Cancelled")
  })

  it("falls back to the raw state string for unknown values", () => {
    expect(lifecycleLabel("bogus")).toBe("bogus")
  })
})

describe("lifecycleTone", () => {
  it("maps each state to its Badge tone", () => {
    expect(lifecycleTone("draft")).toBe("slate")
    expect(lifecycleTone("active")).toBe("emerald")
    expect(lifecycleTone("on_hold")).toBe("amber")
    expect(lifecycleTone("complete")).toBe("indigo")
    expect(lifecycleTone("cancelled")).toBe("rose")
  })

  it("defaults to slate for unknown values", () => {
    expect(lifecycleTone("bogus")).toBe("slate")
  })
})
