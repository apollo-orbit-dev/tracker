import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { ApiError } from "@/api/auth"

export type COR = {
  id: string
  project_id: string
  number: string
  description: string
  amount: string
  submitted_date: string | null
  approved_date: string | null
  status: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type CORListResponse = { items: COR[]; total: number }

export type CORCreate = {
  number: string
  description: string
  amount: string
  submitted_date?: string | null
  approved_date?: string | null
  status?: string
}

export type CORUpdate = Partial<CORCreate>

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

const key = (pid: string) => ["projects", pid, "cors"] as const

export function useCORList(pid: string | undefined) {
  return useQuery<CORListResponse, ApiError>({
    queryKey: key(pid ?? ""),
    queryFn: () =>
      apiCall<CORListResponse>(
        `/api/projects/${pid}/cors`,
        { method: "GET" },
        "Load failed",
      ),
    enabled: !!pid,
  })
}

export function useCORCreate(pid: string) {
  const qc = useQueryClient()
  return useMutation<COR, ApiError, CORCreate>({
    mutationFn: (body) =>
      apiCall<COR>(
        `/api/projects/${pid}/cors`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Create failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(pid) })
      // Dashboard CORs widget rolls up these rows — keep it in sync.
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}

export function useCORUpdate(pid: string) {
  const qc = useQueryClient()
  return useMutation<COR, ApiError, { id: string; body: CORUpdate }>({
    mutationFn: ({ id, body }) =>
      apiCall<COR>(
        `/api/projects/${pid}/cors/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Update failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(pid) })
      // Dashboard CORs widget rolls up these rows — keep it in sync.
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}

export function useCORDelete(pid: string) {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (id) =>
      apiCall<void>(
        `/api/projects/${pid}/cors/${id}`,
        { method: "DELETE" },
        "Delete failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(pid) })
      // Dashboard CORs widget rolls up these rows — keep it in sync.
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}
