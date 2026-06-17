// Phase 2.1 — per-user dashboard composition.
// Phase 2.4 — widget endpoints moved under /api/dashboards/{did}/widgets;
// every hook now takes a dashboardId.
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { ApiError } from "@/api/auth"

export type DashboardWidget = {
  id: string
  dashboard_id: string
  widget_type: string
  order_index: number
  width: number  // 1 or 2 columns
  // Phase 2.11: which column (0 = left, 1 = right) a half-width widget
  // renders in. Ignored when width === 2 (spans both columns). Required
  // from Phase 2.11.1 onward — the backend always populates it.
  column: 0 | 1
  // Null → fall back to the widget library's default label.
  title: string | null
  config: Record<string, unknown> | null
}

export type FieldAggregateConfig = {
  template_id: string
  primary_field_id: string
  secondary_field_id?: string | null
}

export type DashboardWidgetsResponse = {
  items: DashboardWidget[]
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

const widgetsKey = (dashboardId: string) =>
  ["dashboards", dashboardId, "widgets"] as const

export function useDashboardWidgets(dashboardId: string | undefined) {
  return useQuery<DashboardWidgetsResponse, ApiError>({
    queryKey: widgetsKey(dashboardId ?? ""),
    queryFn: () =>
      apiCall<DashboardWidgetsResponse>(
        `/api/dashboards/${dashboardId}/widgets`,
        { method: "GET" },
        "Load failed",
      ),
    enabled: !!dashboardId,
  })
}

export type WidgetAddInput = {
  widget_type: string
  config?: Record<string, unknown> | null
}

export function useWidgetAdd(dashboardId: string) {
  const qc = useQueryClient()
  return useMutation<DashboardWidget, ApiError, WidgetAddInput>({
    mutationFn: (input) =>
      apiCall<DashboardWidget>(
        `/api/dashboards/${dashboardId}/widgets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        "Add failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: widgetsKey(dashboardId) })
    },
  })
}

export type WidgetUpdate = {
  config?: Record<string, unknown> | null
  width?: number
  title?: string | null
}

export function useWidgetUpdate(dashboardId: string) {
  const qc = useQueryClient()
  return useMutation<
    DashboardWidget,
    ApiError,
    { id: string; body: WidgetUpdate }
  >({
    mutationFn: ({ id, body }) =>
      apiCall<DashboardWidget>(
        `/api/dashboards/${dashboardId}/widgets/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Update failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: widgetsKey(dashboardId) })
    },
  })
}

export function useWidgetWidthUpdate(dashboardId: string) {
  const qc = useQueryClient()
  return useMutation<
    DashboardWidget,
    ApiError,
    { id: string; width: number }
  >({
    mutationFn: ({ id, width }) =>
      apiCall<DashboardWidget>(
        `/api/dashboards/${dashboardId}/widgets/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ width }),
        },
        "Resize failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: widgetsKey(dashboardId) })
    },
  })
}

export function useWidgetRemove(dashboardId: string) {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (id) =>
      apiCall<void>(
        `/api/dashboards/${dashboardId}/widgets/${id}`,
        { method: "DELETE" },
        "Remove failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: widgetsKey(dashboardId) })
    },
  })
}

export type WidgetReorderItem = { id: string; column: 0 | 1 }

export function useWidgetReorder(dashboardId: string) {
  const qc = useQueryClient()
  return useMutation<void, ApiError, WidgetReorderItem[]>({
    mutationFn: (items) =>
      apiCall<void>(
        `/api/dashboards/${dashboardId}/widgets/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        },
        "Reorder failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: widgetsKey(dashboardId) })
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: widgetsKey(dashboardId) })
    },
  })
}
