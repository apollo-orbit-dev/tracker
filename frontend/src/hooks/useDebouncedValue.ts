import { useEffect, useState } from "react"

// Returns `value`, but only after it's held still for `delay` ms.
// Used by the project list search so we don't hammer /api/projects
// on every keystroke.
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}
