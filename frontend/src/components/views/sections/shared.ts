// Phase 7.10 — shared contract + helpers for the per-type config
// sections split out of BlockConfigSheet. Each section owns the draft
// state for its block type and reports upward on every change via a
// controlled `onState({ config, valid, hint })` call:
//   - config: the exact PATCH-ready config body for this block type
//   - valid:  whether the shell may enable Save (mirrors the gating
//             BlockConfigSheet computed inline before the split)
//   - hint:   the footer message string rendered next to Save (leading
//             space included, "" when nothing applies) — carried in
//             the state because the metric section has two distinct
//             messages a single boolean can't distinguish
// `onState` must be referentially stable (the shell passes a setState
// directly); sections call it from an effect keyed on their drafts.
// INVARIANT: the first onState must fire unconditionally on mount
// (report valid:false while data loads) — never condition it on
// fetches. The shell nulls its section state synchronously when the
// block changes, so a section that stays silent until a fetch lands
// would leave Save gated on stale/absent state.
// The server (validate_block_config) remains the boundary validator —
// all of this is UX mirroring only.
import type { MetricDefinition, ViewBlock } from "@/api/views"

export type SectionState = {
  config: Record<string, unknown>
  valid: boolean
  hint: string
}

export type SectionProps = {
  initialConfig: ViewBlock["config"]
  onState: (s: SectionState) => void
}

export const DEFAULT_METRIC: MetricDefinition = {
  entity: "project",
  aggregation: "count",
  template_id: null,
  target_field: null,
  conditions: { combinator: "and", items: [] },
}

/** Loose shape check for a stored metric (7.10 review carry-over):
 * entity/aggregation must be strings and `conditions`, when present,
 * must carry an `items` array. Malformed stored configs fall back to
 * DEFAULT_METRIC instead of throwing at render. */
export function isMetricShape(v: unknown): v is MetricDefinition {
  if (v === null || typeof v !== "object") return false
  const m = v as Record<string, unknown>
  if (typeof m.entity !== "string" || typeof m.aggregation !== "string") {
    return false
  }
  if (m.conditions != null) {
    const c = m.conditions as Record<string, unknown>
    if (typeof c !== "object" || !Array.isArray(c.items)) return false
  }
  return true
}

export function metricFromConfig(
  config: ViewBlock["config"],
): MetricDefinition {
  // MetricCardConfig and ChartBlockConfig both keep the metric under
  // the `metric` key, so this covers both block types.
  const m = (config as { metric?: unknown } | null)?.metric
  return isMetricShape(m) ? m : DEFAULT_METRIC
}

export function groupByFromConfig(config: ViewBlock["config"]): string {
  const g = (config as { group_by?: unknown } | null)?.group_by
  return typeof g === "string" ? g : ""
}
