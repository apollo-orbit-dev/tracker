// Single source of truth for the widget catalog on the frontend.
// `widget_type` strings must match the backend WIDGET_TYPES enum and
// the DB CHECK constraint in migrations 0011 + 0012.
import type { ComponentType } from "react"

import { CORSummaryWidget } from "@/components/widgets/CORSummaryWidget"
import { FieldAggregateWidget } from "@/components/widgets/FieldAggregateWidget"
import { LifecycleWidget } from "@/components/widgets/LifecycleWidget"
import { MilestoneLookaheadWidget } from "@/components/widgets/MilestoneLookaheadWidget"
import { RecentActivityWidget } from "@/components/widgets/RecentActivityWidget"
import type { DcdFilter } from "@/api/dashboard"
import type {
  DashboardWidget,
  FieldAggregateConfig,
} from "@/api/dashboard_widgets"

// Each widget gets the active DashboardWidget passed in via this prop
// shape so config-driven widgets can read their config + reopen the
// config Sheet on first render.
export type WidgetRenderProps = {
  widget: DashboardWidget
  dashboardId: string
  onConfigure: () => void
}

export type WidgetDescriptor = {
  type: string
  label: string
  description: string
  configurable: boolean
  // Whether the user can have multiple instances on their dashboard.
  // The partial unique index on the backend allows multiple instances
  // when they have differing configs; setting multi=true skips the
  // "On dashboard" badge in the picker so users can layer filtered
  // variants alongside an unconfigured default.
  multi: boolean
  Component: ComponentType<WidgetRenderProps>
}

// Phase 2.5: pull the dept/client/discipline filter out of a 2.0
// widget's config (or undefined if unconfigured).
function dcdFilterOf(widget: DashboardWidget): DcdFilter | undefined {
  if (!widget.config) return undefined
  const cfg = widget.config as Record<string, unknown>
  const out: DcdFilter = {}
  if (typeof cfg.department_id === "string") out.department_id = cfg.department_id
  if (typeof cfg.client_id === "string") out.client_id = cfg.client_id
  if (typeof cfg.discipline_id === "string") out.discipline_id = cfg.discipline_id
  return Object.keys(out).length ? out : undefined
}

export const WIDGET_LIBRARY: ReadonlyArray<WidgetDescriptor> = [
  {
    type: "lifecycle",
    label: "Projects by lifecycle",
    description:
      "Tile per state with the count of live projects. Optional filter by department, client, and/or discipline.",
    configurable: true,
    multi: true,
    Component: ({ widget }) => (
      <LifecycleWidget title={widget.title} filter={dcdFilterOf(widget)} />
    ),
  },
  {
    type: "milestone_lookahead",
    label: "Milestone lookahead",
    description:
      "Past-due and upcoming milestones across your projects. Optional dept/client/discipline filter and lookahead window.",
    configurable: true,
    multi: true,
    Component: ({ widget, dashboardId }) => (
      <MilestoneLookaheadWidget widget={widget} dashboardId={dashboardId} />
    ),
  },
  {
    type: "recent_activity",
    label: "Recent activity",
    description:
      "Latest notes across your projects. Optional dept/client/discipline filter.",
    configurable: true,
    multi: true,
    Component: ({ widget }) => (
      <RecentActivityWidget
        title={widget.title}
        filter={dcdFilterOf(widget)}
      />
    ),
  },
  {
    type: "cor_summary",
    label: "CORs",
    description:
      "Change orders by status with dollar totals. Optional dept/client/discipline filter.",
    configurable: true,
    multi: true,
    Component: ({ widget }) => (
      <CORSummaryWidget title={widget.title} filter={dcdFilterOf(widget)} />
    ),
  },
  {
    type: "field_aggregate",
    label: "Field aggregate",
    description:
      "Sum a numeric custom field across all projects on one template. Optional second field for X-vs-Y comparisons.",
    configurable: true,
    multi: true,
    Component: ({ widget, onConfigure }) => (
      <FieldAggregateWidget
        config={(widget.config ?? null) as FieldAggregateConfig | null}
        title={widget.title}
        onConfigure={onConfigure}
      />
    ),
  },
]

export const WIDGET_BY_TYPE: Record<string, WidgetDescriptor> = Object.fromEntries(
  WIDGET_LIBRARY.map((w) => [w.type, w]),
)
