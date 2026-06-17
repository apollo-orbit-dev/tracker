import { LIFECYCLE_META, lifecycleLabel } from "@/lib/lifecycle"

// @deprecated Phase 4.2 — superseded by `<Badge tone={lifecycleTone(state)} dot>`
// for new surfaces. ProjectsListPage (4.2) and ProjectDetailPage (4.3) both
// migrated. The last remaining consumer is `ProjectsViewPage`; delete this
// file when that page is redressed (or its LifecycleBadge usage is swapped).
export function LifecycleBadge({ state }: { state: string }) {
  const meta = (LIFECYCLE_META as Record<string, { className: string }>)[state]
  const className = meta?.className ?? "bg-slate-200 text-slate-800"
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {lifecycleLabel(state)}
    </span>
  )
}
