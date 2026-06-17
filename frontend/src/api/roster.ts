import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { ApiError } from "@/api/auth"

export type RosterEntry = {
  user_role_id: string
  user_id: string
  email: string
  display_name: string
  role_id: string
  created_at: string
}

export type RosterListResponse = {
  items: RosterEntry[]
  total: number
}

export type GrantCreate = {
  user_id: string
  role_id: "department_manager" | "project_editor" | "viewer"
}

export type GrantUpdate = {
  role_id: "department_manager" | "project_editor" | "viewer"
}

export type UserPickerItem = {
  id: string
  email: string
  display_name: string
}

export type UserPickerResponse = {
  items: UserPickerItem[]
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

const rosterKey = (deptId: string) => ["roster", deptId] as const
const pickerKey = ["users", "picker"] as const

export function useDepartmentRoster(deptId: string | undefined) {
  return useQuery<RosterListResponse, ApiError>({
    queryKey: rosterKey(deptId ?? ""),
    queryFn: () =>
      apiCall<RosterListResponse>(
        `/api/departments/${deptId}/roster`,
        { method: "GET" },
        "Load failed",
      ),
    enabled: !!deptId,
  })
}

export function useRoleGrant(deptId: string) {
  const qc = useQueryClient()
  return useMutation<RosterEntry, ApiError, GrantCreate>({
    mutationFn: (body) =>
      apiCall<RosterEntry>(
        `/api/departments/${deptId}/roster`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Grant failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rosterKey(deptId) })
    },
  })
}

export function useRoleUpdate(deptId: string) {
  const qc = useQueryClient()
  return useMutation<
    RosterEntry,
    ApiError,
    { userRoleId: string; body: GrantUpdate }
  >({
    mutationFn: ({ userRoleId, body }) =>
      apiCall<RosterEntry>(
        `/api/departments/${deptId}/roster/${userRoleId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Update failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rosterKey(deptId) })
    },
  })
}

export function useRoleRevoke(deptId: string) {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (userRoleId) =>
      apiCall<void>(
        `/api/departments/${deptId}/roster/${userRoleId}`,
        { method: "DELETE" },
        "Revoke failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rosterKey(deptId) })
    },
  })
}

export function useUserPicker() {
  return useQuery<UserPickerResponse, ApiError>({
    queryKey: pickerKey,
    queryFn: () =>
      apiCall<UserPickerResponse>(
        "/api/users/picker",
        { method: "GET" },
        "Load failed",
      ),
    staleTime: 60_000,
  })
}
