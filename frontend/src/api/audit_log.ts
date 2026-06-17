import { useQuery } from "@tanstack/react-query"

import { ApiError } from "@/api/auth"

export type AuditLogItem = {
  id: number
  entity_type: string
  entity_id: string
  project_id: string | null
  operation: string
  changes: Record<string, unknown>
  changed_by: string | null
  changed_by_email: string
  changed_at: string
}

export type AuditLogListResponse = {
  items: AuditLogItem[]
  total: number
  limit: number
  offset: number
}

export type AuditLogFilters = {
  entity_type?: string
  user_id?: string
  project_id?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
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

function buildQuery(filters: AuditLogFilters): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === "" || v === null) continue
    params.set(k, String(v))
  }
  const s = params.toString()
  return s ? `?${s}` : ""
}

export function useAuditLogList(filters: AuditLogFilters) {
  return useQuery<AuditLogListResponse, ApiError>({
    queryKey: ["admin", "audit-log", filters],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/audit-log${buildQuery(filters)}`,
        { credentials: "include" },
      )
      const body = await jsonOrEmpty(res)
      if (!res.ok) {
        throw new ApiError(detailOf(body, "Load failed"), res.status)
      }
      return body as AuditLogListResponse
    },
  })
}
