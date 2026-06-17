import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { useDensity } from "./useDensity"

describe("useDensity", () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute("data-density")
  })
  afterEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute("data-density")
  })

  it("defaults to comfortable and clears data-density", () => {
    const { result } = renderHook(() => useDensity())
    expect(result.current[0]).toBe("comfortable")
    expect(document.documentElement.hasAttribute("data-density")).toBe(false)
  })

  it("setting to compact applies the attribute and persists", () => {
    const { result } = renderHook(() => useDensity())
    act(() => result.current[1]("compact"))
    expect(document.documentElement.dataset.density).toBe("compact")
    expect(window.localStorage.getItem("tracker.density")).toBe(
      JSON.stringify("compact"),
    )
  })

  it("restores stored compact value on mount", () => {
    window.localStorage.setItem(
      "tracker.density",
      JSON.stringify("compact"),
    )
    const { result } = renderHook(() => useDensity())
    expect(result.current[0]).toBe("compact")
    expect(document.documentElement.dataset.density).toBe("compact")
  })

  it("removes the attribute when toggled back to comfortable", () => {
    const { result } = renderHook(() => useDensity())
    act(() => result.current[1]("compact"))
    act(() => result.current[1]("comfortable"))
    expect(document.documentElement.hasAttribute("data-density")).toBe(false)
  })
})
