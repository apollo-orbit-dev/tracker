import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { useLocalStorage } from "./useLocalStorage"

describe("useLocalStorage", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => {
    window.localStorage.clear()
  })

  it("returns the default when no value is stored", () => {
    const { result } = renderHook(() => useLocalStorage("k", "default"))
    expect(result.current[0]).toBe("default")
  })

  it("returns the stored value when present", () => {
    window.localStorage.setItem("k", JSON.stringify("stored"))
    const { result } = renderHook(() => useLocalStorage("k", "default"))
    expect(result.current[0]).toBe("stored")
  })

  it("writes through to localStorage on set", () => {
    const { result } = renderHook(() => useLocalStorage("k", false))
    act(() => result.current[1](true))
    expect(result.current[0]).toBe(true)
    expect(window.localStorage.getItem("k")).toBe(JSON.stringify(true))
  })

  it("falls back to default when the stored value is unparseable", () => {
    window.localStorage.setItem("k", "{not json")
    const { result } = renderHook(() => useLocalStorage("k", "default"))
    expect(result.current[0]).toBe("default")
  })
})
