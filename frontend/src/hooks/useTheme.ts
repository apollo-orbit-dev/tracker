import { useEffect } from "react"

import { useLocalStorage } from "@/hooks/useLocalStorage"

export type Theme = "light" | "dark"

const KEY = "tracker.theme"

/**
 * Persistent theme toggle. Applied to `document.documentElement` via
 * `data-theme` AND the `dark` class so that both shadcn's `.dark`-prefixed
 * components and the Phase 4 design's `[data-theme="dark"]` selectors
 * resolve to the same state.
 *
 * Defaults to "light" — the design's primary mode. Users opt into dark via
 * the sidebar footer's user menu.
 */
export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setTheme] = useLocalStorage<Theme>(KEY, "light")

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    if (theme === "dark") {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
  }, [theme])

  return [theme, setTheme]
}
