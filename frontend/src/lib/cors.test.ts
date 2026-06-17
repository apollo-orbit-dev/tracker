import { describe, expect, it } from "vitest"

import { corStatusLabel, corStatusTone } from "./cors"

describe("corStatusTone", () => {
  it("maps each backend status to its Badge tone", () => {
    expect(corStatusTone("draft")).toBe("slate")
    expect(corStatusTone("submitted")).toBe("blue")
    expect(corStatusTone("approved")).toBe("emerald")
    expect(corStatusTone("rejected")).toBe("rose")
    expect(corStatusTone("cancelled")).toBe("slate")
  })

  it("defaults to slate for unknown values", () => {
    expect(corStatusTone("bogus")).toBe("slate")
  })
})

describe("corStatusLabel", () => {
  it("returns the human label for each known status", () => {
    expect(corStatusLabel("draft")).toBe("Draft")
    expect(corStatusLabel("submitted")).toBe("Submitted")
    expect(corStatusLabel("approved")).toBe("Approved")
    expect(corStatusLabel("rejected")).toBe("Rejected")
    expect(corStatusLabel("cancelled")).toBe("Cancelled")
  })

  it("falls back to the raw status for unknown values", () => {
    expect(corStatusLabel("bogus")).toBe("bogus")
  })
})
