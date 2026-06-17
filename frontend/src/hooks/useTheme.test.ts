import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { useTheme } from "./useTheme"

describe("useTheme", () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute("data-theme")
    document.documentElement.classList.remove("dark")
  })
  afterEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute("data-theme")
    document.documentElement.classList.remove("dark")
  })

  it("defaults to light and applies data-theme=light", () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current[0]).toBe("light")
    expect(document.documentElement.dataset.theme).toBe("light")
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })

  it("toggles to dark, sets data-theme + .dark class, persists", () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current[1]("dark"))
    expect(document.documentElement.dataset.theme).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(window.localStorage.getItem("tracker.theme")).toBe(
      JSON.stringify("dark"),
    )
  })

  it("restores a stored dark value on mount", () => {
    window.localStorage.setItem("tracker.theme", JSON.stringify("dark"))
    const { result } = renderHook(() => useTheme())
    expect(result.current[0]).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("removes the .dark class when toggled back to light", () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current[1]("dark"))
    act(() => result.current[1]("light"))
    expect(document.documentElement.classList.contains("dark")).toBe(false)
    expect(document.documentElement.dataset.theme).toBe("light")
  })
})
