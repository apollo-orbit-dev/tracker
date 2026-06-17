import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

export type Crumb = {
  label: string
  /** If provided, the crumb renders as a link. Otherwise plain text. */
  to?: string
}

type ContextValue = {
  crumbs: Crumb[]
  setCrumbs: (crumbs: Crumb[]) => void
}

const TopbarContext = createContext<ContextValue | null>(null)

/**
 * Phase 4.2 — top-bar breadcrumb context. Pages set their breadcrumb
 * trail via `useTopbarCrumbs([...])` which writes here on mount and
 * clears on unmount. The `Topbar` reads `crumbs` and renders a
 * `ChevronRight`-separated trail.
 *
 * Empty array means "render nothing in the breadcrumb slot." That's the
 * default state — unredressed pages still carry their own `PageHeader`
 * for now, so the topbar stays quiet to avoid stranded crumbs above an
 * already-titled page.
 */
export function TopbarProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbsState] = useState<Crumb[]>([])
  const setCrumbs = useCallback((next: Crumb[]) => setCrumbsState(next), [])
  const value = useMemo(() => ({ crumbs, setCrumbs }), [crumbs, setCrumbs])
  return (
    <TopbarContext.Provider value={value}>{children}</TopbarContext.Provider>
  )
}

export function useTopbarContext(): ContextValue {
  const ctx = useContext(TopbarContext)
  if (!ctx) {
    throw new Error("useTopbarContext must be used inside a TopbarProvider")
  }
  return ctx
}
