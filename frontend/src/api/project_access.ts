import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { ApiError } from "@/api/auth"

export type ProjectAccessGrant = {
  user_id: string
  email: string
  display_name: string
  granted_at: string
  granted_by: string | null
}

export type ProjectAccessListResponse = {
  items: ProjectAccessGrant[]
  total: number
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

const listKey = (pid: string) => ["project-access", pid] as const

export function useProjectAccessList(pid: string) {
  return useQuery<ProjectAccessListResponse, ApiError>({
    queryKey: listKey(pid),
    enabled: !!pid,
    queryFn: () =>
      apiCall<ProjectAccessListResponse>(
        `/api/projects/${pid}/access`,
        { method: "GET" },
        "Load failed",
      ),
  })
}

export function useProjectAccessGrant(pid: string) {
  const qc = useQueryClient()
  return useMutation<ProjectAccessGrant, ApiError, string>({
    mutationFn: (user_id) =>
      apiCall<ProjectAccessGrant>(
        `/api/projects/${pid}/access`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id }),
        },
        "Grant failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey(pid) })
    },
  })
}

export function useProjectAccessRevoke(pid: string) {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (user_id) =>
      apiCall<void>(
        `/api/projects/${pid}/access/${user_id}`,
        { method: "DELETE" },
        "Revoke failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey(pid) })
    },
  })
}
