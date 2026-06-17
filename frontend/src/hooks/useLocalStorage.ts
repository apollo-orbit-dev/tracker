import { useCallback, useEffect, useState } from "react"

// Typed localStorage round-trip. Reads on mount, writes through on set.
// Falls back to the default if parsing fails (corrupted entries).
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return defaultValue
    try {
      return JSON.parse(raw) as T
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])

  const set = useCallback((next: T) => setValue(next), [])
  return [value, set]
}
