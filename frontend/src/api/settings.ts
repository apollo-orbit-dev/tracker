import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@/api/auth"

export type AppSetting = { key: string; value: Record<string, unknown> }

async function call<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : fallback
    throw new ApiError(detail, res.status)
  }
  return body as T
}

export function useAppSetting(key: string) {
  return useQuery<AppSetting, ApiError>({
    queryKey: ["admin", "settings", key],
    queryFn: () => call<AppSetting>(`/api/admin/settings/${key}`, { method: "GET" }, "Load failed"),
  })
}

export function useUpdateAppSetting(key: string) {
  const qc = useQueryClient()
  return useMutation<AppSetting, ApiError, Record<string, unknown>>({
    mutationFn: (value) =>
      call<AppSetting>(
        `/api/admin/settings/${key}`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value }) },
        "Save failed",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "settings", key] }),
  })
}
