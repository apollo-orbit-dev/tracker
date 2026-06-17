import { useEffect } from "react"

import {
  type Crumb,
  useTopbarContext,
} from "@/components/topbar/TopbarContext"

/**
 * Phase 4.2 — register a page's breadcrumb trail with the topbar.
 *
 * Pages call this with their crumb array at render time; the hook writes
 * it to the topbar context on mount and clears on unmount. Stable-deps
 * via JSON.stringify so the inline `[{ label: "Projects" }]` shape
 * doesn't re-fire the effect on every render.
 *
 * Pass `null` to opt out — useful when a page is embedded inside
 * another (e.g., the projects-list Split layout embeds the detail
 * page, and the parent owns the topbar crumbs).
 */
export function useTopbarCrumbs(crumbs: Crumb[] | null): void {
  const { setCrumbs } = useTopbarContext()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const key = crumbs === null ? null : JSON.stringify(crumbs)

  useEffect(() => {
    if (crumbs === null) return
    setCrumbs(crumbs)
    return () => setCrumbs([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setCrumbs])
}
