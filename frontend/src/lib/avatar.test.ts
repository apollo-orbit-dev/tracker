import { describe, expect, it } from "vitest"

import { avatarHues, hashName, initialsOf } from "./avatar"

describe("hashName", () => {
  it("returns deterministic values for the same input", () => {
    expect(hashName("Jane Doe")).toBe(hashName("Jane Doe"))
  })

  it("returns different hashes for different names", () => {
    expect(hashName("Jane Doe")).not.toBe(hashName("John Smith"))
  })

  it("returns 0 for an empty string", () => {
    expect(hashName("")).toBe(0)
  })
})

describe("avatarHues", () => {
  it("returns oklch strings for background and foreground", () => {
    const { background, color } = avatarHues("Jane Doe")
    expect(background).toMatch(/^oklch\(0\.92 0\.04 \d+(\.\d+)?\)$/)
    expect(color).toMatch(/^oklch\(0\.42 0\.12 \d+(\.\d+)?\)$/)
  })

  it("is stable across calls for the same name", () => {
    expect(avatarHues("Jane Doe")).toEqual(avatarHues("Jane Doe"))
  })

  it("spreads hues across the 0-360 range over many inputs", () => {
    const hues = new Set<number>()
    for (let i = 0; i < 200; i++) {
      const name = `User ${i}`
      const { background } = avatarHues(name)
      const match = background.match(/(\d+(\.\d+)?)\)/)
      if (match) hues.add(Math.floor(Number(match[1])))
    }
    expect(hues.size).toBeGreaterThan(30)
  })
})

describe("initialsOf", () => {
  it("returns two letters from first + last name", () => {
    expect(initialsOf("Jane Doe")).toBe("JD")
  })

  it("returns up to two letters from a single name", () => {
    expect(initialsOf("Jane")).toBe("JA")
  })

  it("returns ? for empty", () => {
    expect(initialsOf("")).toBe("?")
  })

  it("uppercases", () => {
    expect(initialsOf("alice anderson")).toBe("AA")
  })
})
