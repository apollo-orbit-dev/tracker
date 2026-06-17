// Phase 7.3 — custom views: TanStack Query hooks over the Phase
// 7.1/7.2 endpoints (/api/views*, /api/metrics/eval). Mirrors
// api/dashboard_widgets.ts; ApiError is imported from api/auth (the
// shared class), apiCall is duplicated because no module exports it.
// detailOf additionally joins array details — the views/metrics
// endpoints return 422 reason *lists*.
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { ApiError } from "@/api/auth"

async function jsonOrEmpty(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

function detailOf(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as { detail: unknown }).detail
    if (typeof d === "string") return d
    if (Array.isArray(d)) return d.map(String).join("; ")
  }
  return fallback
}

async function apiCall<T>(
  url: string,
  init: RequestInit,
  fallback: string,
): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init })
  if (res.status === 204) return undefined as T
  const body = await jsonOrEmpty(res)
  if (!res.ok) throw new ApiError(detailOf(body, fallback), res.status)
  return body as T
}

export type CustomView = {
  id: string
  name: string
  order_index: number
  published_department_id: string | null
  // Phase 7.15/7.16 sharing fields (mirror backend CustomViewOut):
  is_owner: boolean
  owner_name: string
  published_department_code: string | null
}

export type MetricCondition = { field: string; op: string; value?: unknown }

// Phase 7.14 — per-block scope shape (named so ScopePicker, MetricBuilder
// and BreakdownConfigSection share one type). Field names mirror the
// backend MetricScope; the server (_scoped_base) applies them.
export type MetricScope = {
  department_id?: string | null
  client_id?: string | null
  discipline_id?: string | null
  lifecycle_state?: string | null
  // Backend-supported but NOT surfaced by ScopePicker (Phase 7.14) —
  // reachable via a `status` condition on cor metrics. Present here so the
  // type matches the backend; no UI producer yet.
  cor_status?: string[] | null
}

export type MetricDefinition = {
  entity: "project" | "milestone" | "cor"
  aggregation:
    | "count"
    | "count_distinct"
    | "sum"
    | "avg"
    | "min"
    | "max"
    | "pct_of_total"
  template_id?: string | null
  target_field?: string | null
  conditions?: { combinator: "and" | "or"; items: MetricCondition[] }
  scope?: MetricScope
}

export type MetricCardConfig = {
  metric: MetricDefinition
  thresholds?: { green: number; amber: number } | null
  money?: boolean
  compact?: boolean
}

export type ChartBlockConfig = {
  metric: MetricDefinition
  group_by: string
  kind: "bar" | "donut"
  money?: boolean
}

export type BreakdownBlockConfig = {
  group_by: string
  columns: { label: string; metric: MetricDefinition; money?: boolean }[]
}

// Phase 7.11 — mirror of the backend TableBlockConfig (schemas/views.py).
// Column keys use the view_columns grammar (builtin:* / custom_field:*
// / milestone:*:date|planned|actual); the block stores CONFIG only —
// its data path is the existing GET /api/projects via useProjectList.
export type TableBlockConfig = {
  template_id: string
  columns: string[]
  lifecycle_state?: string | null
  q?: string | null
  // Phase 7.18 — optional project field conditions (MetricConditions
  // shape), applied via GET /api/projects?conditions= and validated
  // server-side through compile_project_conditions.
  conditions?: { combinator: "and" | "or"; items: MetricCondition[] } | null
  limit: 6 | 10 | 15
  sort?: string | null
  sort_direction?: "asc" | "desc" | null
}

// Phase 7.5/7.5.1 block-data union, discriminated on `kind`. Numeric
// values are Decimal-serialized JSON strings ("350"). The is_null /
// is_other sentinel flags mark the synthetic "—" (unset) and "Other"
// (top-N tail) buckets — labels are display text only, so consumers
// must key/disable off the flags, never off label matching (a real
// select option may literally be named "Other" or "—").
export type GroupRow = {
  label: string
  value: string | null
  is_null: boolean
  is_other: boolean
}

export type BreakdownRow = {
  label: string
  cells: (string | null)[]
  is_null: boolean
  is_other: boolean
}

export type BlockData =
  | { kind: "metric"; value: string | null }
  | {
      kind: "chart"
      rows: GroupRow[]
      money: boolean
      chart_kind: "bar" | "donut"
    }
  | {
      kind: "breakdown"
      columns: string[]
      money: boolean[]
      rows: BreakdownRow[]
    }

export type ViewBlock = {
  id: string
  view_id: string
  block_type: "metric" | "chart" | "breakdown" | "table" | "text"
  title: string | null
  order_index: number
  width: 1 | 2 | 4
  accent: "indigo" | "blue" | "emerald" | "amber" | "rose" | "slate"
  config: Record<string, unknown> | null
}

export const viewsKey = ["views"] as const
export const blocksKey = (viewId: string) =>
  ["views", viewId, "blocks"] as const

export function useViews() {
  return useQuery<{ items: CustomView[] }, ApiError>({
    queryKey: viewsKey,
    queryFn: () => apiCall("/api/views", { method: "GET" }, "Load failed"),
  })
}

export function useViewCreate() {
  const qc = useQueryClient()
  return useMutation<CustomView, ApiError, { name: string }>({
    mutationFn: (input) =>
      apiCall(
        "/api/views",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        "Create failed",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: viewsKey }),
  })
}

export function useViewUpdate(viewId: string) {
  const qc = useQueryClient()
  return useMutation<CustomView, ApiError, { name: string }>({
    mutationFn: (input) =>
      apiCall(
        `/api/views/${viewId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        "Rename failed",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: viewsKey }),
  })
}

export function useViewDelete() {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (viewId) =>
      apiCall(`/api/views/${viewId}`, { method: "DELETE" }, "Delete failed"),
    onSuccess: () => qc.invalidateQueries({ queryKey: viewsKey }),
  })
}

// Phase 7.16 — sharing mutations over the 7.15 endpoints. All invalidate
// `viewsKey` so the sidebar / Command-K and the ViewPage header reflect
// the new published state (or the new copy) immediately.
export function useViewPublish() {
  const qc = useQueryClient()
  return useMutation<
    CustomView,
    ApiError,
    { viewId: string; departmentId: string }
  >({
    mutationFn: ({ viewId, departmentId }) =>
      apiCall(
        `/api/views/${viewId}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ department_id: departmentId }),
        },
        "Publish failed",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: viewsKey }),
  })
}

export function useViewUnpublish() {
  const qc = useQueryClient()
  return useMutation<CustomView, ApiError, string>({
    mutationFn: (viewId) =>
      apiCall(
        `/api/views/${viewId}/unpublish`,
        { method: "POST" },
        "Unpublish failed",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: viewsKey }),
  })
}

export function useViewDuplicate() {
  const qc = useQueryClient()
  return useMutation<CustomView, ApiError, string>({
    mutationFn: (viewId) =>
      apiCall(
        `/api/views/${viewId}/duplicate`,
        { method: "POST" },
        "Duplicate failed",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: viewsKey }),
  })
}

export function useViewBlocks(viewId: string | undefined) {
  return useQuery<{ items: ViewBlock[] }, ApiError>({
    queryKey: blocksKey(viewId ?? ""),
    queryFn: () =>
      apiCall(`/api/views/${viewId}/blocks`, { method: "GET" }, "Load failed"),
    enabled: !!viewId,
  })
}

export function useBlockAdd(viewId: string) {
  const qc = useQueryClient()
  return useMutation<
    ViewBlock,
    ApiError,
    Partial<Pick<ViewBlock, "title" | "width" | "accent" | "config">> & {
      block_type: ViewBlock["block_type"]
    }
  >({
    mutationFn: (input) =>
      apiCall(
        `/api/views/${viewId}/blocks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        "Add failed",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: blocksKey(viewId) }),
  })
}

export function useBlockUpdate(viewId: string) {
  const qc = useQueryClient()
  return useMutation<
    ViewBlock,
    ApiError,
    { blockId: string } & Partial<
      Pick<ViewBlock, "title" | "width" | "accent" | "config">
    >
  >({
    mutationFn: ({ blockId, ...input }) =>
      apiCall(
        `/api/views/${viewId}/blocks/${blockId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        "Save failed",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: blocksKey(viewId) }),
  })
}

export function useBlockRemove(viewId: string) {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (blockId) =>
      apiCall(
        `/api/views/${viewId}/blocks/${blockId}`,
        { method: "DELETE" },
        "Remove failed",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: blocksKey(viewId) }),
  })
}

export function useBlockDuplicate(viewId: string) {
  const qc = useQueryClient()
  return useMutation<ViewBlock, ApiError, string>({
    mutationFn: (blockId) =>
      apiCall(
        `/api/views/${viewId}/blocks/${blockId}/duplicate`,
        { method: "POST" },
        "Duplicate failed",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: blocksKey(viewId) }),
  })
}

export function useBlocksReorder(viewId: string) {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string[]>({
    mutationFn: (orderedIds) =>
      apiCall(
        `/api/views/${viewId}/blocks/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ordered_ids: orderedIds }),
        },
        "Reorder failed",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: blocksKey(viewId) }),
    // On failure, refetch so the optimistic local order snaps back to
    // the server's truth.
    onError: () => qc.invalidateQueries({ queryKey: blocksKey(viewId) }),
  })
}

export function useBlockData(
  viewId: string,
  blockId: string,
  enabled: boolean,
) {
  return useQuery<BlockData, ApiError>({
    queryKey: ["views", viewId, "blocks", blockId, "data"],
    queryFn: () =>
      apiCall(
        `/api/views/${viewId}/blocks/${blockId}/data`,
        { method: "GET" },
        "Load failed",
      ),
    enabled,
  })
}

// Phase 7.8 drill-down: one entity row behind a metric. Mirrors the
// backend DrillRow; every row carries project_id for click-through.
export type DrillRow = {
  id: string
  project_id: string
  label: string
  sublabel: string
}

/** POST /api/metrics/eval/rows — the rows behind a metric (or one
 *  group bucket). Mirrors the backend DrillRequest exactly: group_by
 *  set + group_value null = the "—" (unset) bucket; group_value
 *  requires group_by (server-validated); rows capped at 100 with a
 *  `total` count. */
export function useMetricRows() {
  return useMutation<
    { total: number; rows: DrillRow[] },
    ApiError,
    { metric: MetricDefinition; group_by?: string | null; group_value?: string | null }
  >({
    mutationFn: (body) =>
      apiCall(
        "/api/metrics/eval/rows",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Load failed",
      ),
  })
}

export function useMetricEval() {
  return useMutation<{ value: string | null }, ApiError, MetricDefinition>({
    mutationFn: (metric) =>
      apiCall(
        "/api/metrics/eval",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(metric),
        },
        "Preview failed",
      ),
  })
}
