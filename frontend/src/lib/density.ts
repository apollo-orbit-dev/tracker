import type { CSSProperties } from "react"

// Inline styles that read the global density CSS vars set by useDensity
// (`:root` defaults + `[data-density="compact"]` overrides in index.css).
// Components that render rows/cells apply these so the Compact/Comfortable
// toggle changes row height + table font everywhere consistently.
export const DENSITY_ROW_STYLE: CSSProperties = {
  height: "var(--row-h)",
  fontSize: "var(--fs-table)",
}

export const DENSITY_CELL_STYLE: CSSProperties = {
  paddingTop: "var(--row-py)",
  paddingBottom: "var(--row-py)",
}
