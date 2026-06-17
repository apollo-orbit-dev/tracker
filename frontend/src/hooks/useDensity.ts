import { useEffect } from "react"

import { useLocalStorage } from "@/hooks/useLocalStorage"

export type Density = "comfortable" | "compact"

const KEY = "tracker.density"

/**
 * Persistent UI density toggle. Sets `document.documentElement` to
 * `data-density="compact"` (or omits the attribute for comfortable, since
 * comfortable values are the `:root` defaults in index.css). Components
 * that care about density read `--row-h` / `--row-py` / `--fs-table` from
 * CSS — no React-side state subscription needed.
 */
export function useDensity(): [Density, (next: Density) => void] {
  const [density, setDensity] = useLocalStorage<Density>(KEY, "comfortable")

  useEffect(() => {
    const root = document.documentElement
    if (density === "compact") {
      root.dataset.density = "compact"
    } else {
      delete root.dataset.density
    }
  }, [density])

  return [density, setDensity]
}
