// Mirror of backend `backend/app/services/lifecycle.py`. Keep in sync.

import type { BadgeTone } from "@/components/Badge"

export type LifecycleState =
  | "draft"
  | "active"
  | "on_hold"
  | "complete"
  | "cancelled"

export const LIFECYCLE_STATES: LifecycleState[] = [
  "draft",
  "active",
  "on_hold",
  "complete",
  "cancelled",
]

export type LifecycleMeta = {
  value: LifecycleState
  label: string
  /** Tailwind class set for the badge. Foreground + tinted background. */
  className: string
}

export const LIFECYCLE_META: Record<LifecycleState, LifecycleMeta> = {
  draft: {
    value: "draft",
    label: "Draft",
    className: "bg-slate-200 text-slate-800",
  },
  active: {
    value: "active",
    label: "Active",
    className: "bg-emerald-500/15 text-emerald-700",
  },
  on_hold: {
    value: "on_hold",
    label: "On hold",
    className: "bg-amber-500/15 text-amber-700",
  },
  complete: {
    value: "complete",
    label: "Complete",
    className: "bg-sky-500/15 text-sky-700",
  },
  cancelled: {
    value: "cancelled",
    label: "Cancelled",
    className: "bg-red-500/15 text-red-700",
  },
}

export function lifecycleLabel(state: string): string {
  return (LIFECYCLE_META as Record<string, LifecycleMeta>)[state]?.label ?? state
}

/**
 * Phase 4.2 — map a lifecycle state to the new `Badge` tone palette.
 * Used by the redressed project list (and later, the project detail
 * page header) so status colors match the rest of the design.
 */
const LIFECYCLE_TONE: Record<LifecycleState, BadgeTone> = {
  draft: "slate",
  active: "emerald",
  on_hold: "amber",
  complete: "indigo",
  cancelled: "rose",
}

export function lifecycleTone(state: string): BadgeTone {
  return (LIFECYCLE_TONE as Record<string, BadgeTone>)[state] ?? "slate"
}
