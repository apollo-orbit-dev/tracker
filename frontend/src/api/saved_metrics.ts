// Phase 7.12 — personal saved-metric library: TanStack Query hooks
// over the Phase 7.9 CRUD at /api/saved-metrics (owner-scoped, 50-cap,
// configs semantically validated server-side by validate_metric).
// Mirrors api/views.ts; apiCall is duplicated per house pattern (no
// module exports it). `config` is a plain dict on the wire — consumers
// parse it as MetricDefinition on apply and the server re-validates
// everything anyway.
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { ApiError } from "@/api/auth"
import type { MetricDefinition } from "@/api/views"

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

export type SavedMetric = {
  id: string
  name: string
  config: Record<string, unknown>
}

export const savedMetricsKey = ["saved-metrics"] as const

export function useSavedMetrics() {
  return useQuery<{ items: SavedMetric[] }, ApiError>({
    queryKey: savedMetricsKey,
    queryFn: () =>
      apiCall("/api/saved-metrics", { method: "GET" }, "Load failed"),
  })
}

export function useSavedMetricCreate() {
  const qc = useQueryClient()
  return useMutation<
    SavedMetric,
    ApiError,
    { name: string; config: MetricDefinition }
  >({
    mutationFn: (input) =>
      apiCall(
        "/api/saved-metrics",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        "Save failed",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: savedMetricsKey }),
  })
}

export function useSavedMetricDelete() {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (metricId) =>
      apiCall(
        `/api/saved-metrics/${metricId}`,
        { method: "DELETE" },
        "Delete failed",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: savedMetricsKey }),
  })
}
