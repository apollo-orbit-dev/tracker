import { useQuery } from "@tanstack/react-query"

import { ApiError } from "@/api/auth"

export type LifecycleCounts = {
  draft: number
  active: number
  on_hold: number
  complete: number
  cancelled: number
}

export type MilestoneLookaheadItem = {
  project_id: string
  project_title: string
  milestone_id: string
  milestone_name: string
  direction: string
  planned_date: string
  days_offset: number
  ad_hoc: boolean
}

export type MilestoneLookaheadResponse = {
  items: MilestoneLookaheadItem[]
  total: number
}

export type CORStatusSummary = {
  status: string
  count: number
  total_amount: string // Decimal serialized as string
}

export type CORSummaryResponse = {
  by_status: CORStatusSummary[]
}

export type ActivityItem = {
  kind: string
  project_id: string
  project_title: string
  author_name: string
  body_preview: string
  created_at: string
}

export type ActivityResponse = {
  items: ActivityItem[]
}

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
  if (
    body &&
    typeof body === "object" &&
    "detail" in body &&
    typeof (body as { detail: unknown }).detail === "string"
  ) {
    return (body as { detail: string }).detail
  }
  return fallback
}

async function get<T>(url: string, fallback: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" })
  const body = await jsonOrEmpty(res)
  if (!res.ok) throw new ApiError(detailOf(body, fallback), res.status)
  return body as T
}

// Phase 2.5: each of the 2.0 data hooks accepts an optional
// dept/client/discipline filter, threaded as query params. Query keys
// include the filter values so different configs use distinct cache
// slots.
export type DcdFilter = {
  department_id?: string | null
  client_id?: string | null
  discipline_id?: string | null
}

function dcdQs(filter: DcdFilter | undefined): string {
  const qs = new URLSearchParams()
  if (filter?.department_id) qs.set("department_id", filter.department_id)
  if (filter?.client_id) qs.set("client_id", filter.client_id)
  if (filter?.discipline_id) qs.set("discipline_id", filter.discipline_id)
  const s = qs.toString()
  return s ? `?${s}` : ""
}

function dcdKey(filter: DcdFilter | undefined) {
  return [
    filter?.department_id ?? null,
    filter?.client_id ?? null,
    filter?.discipline_id ?? null,
  ] as const
}

export function useLifecycleCounts(filter?: DcdFilter) {
  return useQuery<LifecycleCounts, ApiError>({
    queryKey: ["dashboard", "lifecycle", ...dcdKey(filter)],
    queryFn: () =>
      get<LifecycleCounts>(
        `/api/dashboard/projects/lifecycle${dcdQs(filter)}`,
        "Load failed",
      ),
  })
}

// Phase 2.8: milestone_lookahead also supports a per-widget `future_days`
// override (1..365). Extends DcdFilter so existing callers keep working.
export type LookaheadFilter = DcdFilter & {
  future_days?: number | null
}

function lookaheadQs(filter: LookaheadFilter | undefined): string {
  const qs = new URLSearchParams()
  if (filter?.department_id) qs.set("department_id", filter.department_id)
  if (filter?.client_id) qs.set("client_id", filter.client_id)
  if (filter?.discipline_id) qs.set("discipline_id", filter.discipline_id)
  if (filter?.future_days != null) {
    qs.set("future_days", String(filter.future_days))
  }
  const s = qs.toString()
  return s ? `?${s}` : ""
}

function lookaheadKey(filter: LookaheadFilter | undefined) {
  return [
    filter?.department_id ?? null,
    filter?.client_id ?? null,
    filter?.discipline_id ?? null,
    filter?.future_days ?? null,
  ] as const
}

export function useMilestoneLookahead(filter?: LookaheadFilter) {
  return useQuery<MilestoneLookaheadResponse, ApiError>({
    queryKey: ["dashboard", "milestone-lookahead", ...lookaheadKey(filter)],
    queryFn: () =>
      get<MilestoneLookaheadResponse>(
        `/api/dashboard/milestones/lookahead${lookaheadQs(filter)}`,
        "Load failed",
      ),
  })
}

export function useCORSummary(filter?: DcdFilter) {
  return useQuery<CORSummaryResponse, ApiError>({
    queryKey: ["dashboard", "cor-summary", ...dcdKey(filter)],
    queryFn: () =>
      get<CORSummaryResponse>(
        `/api/dashboard/cors/summary${dcdQs(filter)}`,
        "Load failed",
      ),
  })
}

export type FieldAggregatePart = {
  field_name: string
  field_type: string
  total: string
  project_count: number
}

export type FieldAggregateResponse = {
  primary: FieldAggregatePart
  secondary: FieldAggregatePart | null
}

export function useFieldAggregate(
  template_id: string | undefined,
  primary_field_id: string | undefined,
  secondary_field_id: string | undefined,
) {
  const enabled = !!template_id && !!primary_field_id
  const qs = new URLSearchParams()
  if (template_id) qs.set("template_id", template_id)
  if (primary_field_id) qs.set("primary_field_id", primary_field_id)
  if (secondary_field_id) qs.set("secondary_field_id", secondary_field_id)
  return useQuery<FieldAggregateResponse, ApiError>({
    queryKey: ["dashboard", "field-aggregate", template_id, primary_field_id, secondary_field_id ?? null],
    queryFn: () =>
      get<FieldAggregateResponse>(
        `/api/dashboard/field_aggregate?${qs.toString()}`,
        "Load failed",
      ),
    enabled,
  })
}

export function useRecentActivity(filter?: DcdFilter) {
  return useQuery<ActivityResponse, ApiError>({
    queryKey: ["dashboard", "activity", ...dcdKey(filter)],
    queryFn: () =>
      get<ActivityResponse>(
        `/api/dashboard/activity/recent${dcdQs(filter)}`,
        "Load failed",
      ),
  })
}
