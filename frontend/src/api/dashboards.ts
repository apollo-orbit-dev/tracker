// Phase 2.4: per-user multiple dashboards (tabs).
//
// The single-dashboard model from 2.1 ships under this file's hooks.
// Per-tab widgets live in dashboard_widgets.ts, with each hook taking
// the active dashboard's id.
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { ApiError } from "@/api/auth"

export type Dashboard = {
  id: string
  name: string
  order_index: number
}

export type DashboardsResponse = {
  items: Dashboard[]
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

const listKey = ["dashboards"] as const

export function useDashboards() {
  return useQuery<DashboardsResponse, ApiError>({
    queryKey: listKey,
    queryFn: () =>
      apiCall<DashboardsResponse>(
        "/api/dashboards",
        { method: "GET" },
        "Load failed",
      ),
  })
}

export function useDashboardCreate() {
  const qc = useQueryClient()
  return useMutation<Dashboard, ApiError, string>({
    mutationFn: (name) =>
      apiCall<Dashboard>(
        "/api/dashboards",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
        "Create failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey })
    },
  })
}

export function useDashboardRename() {
  const qc = useQueryClient()
  return useMutation<
    Dashboard,
    ApiError,
    { id: string; name: string }
  >({
    mutationFn: ({ id, name }) =>
      apiCall<Dashboard>(
        `/api/dashboards/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
        "Rename failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey })
    },
  })
}

export function useDashboardDelete() {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (id) =>
      apiCall<void>(
        `/api/dashboards/${id}`,
        { method: "DELETE" },
        "Delete failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey })
    },
  })
}
