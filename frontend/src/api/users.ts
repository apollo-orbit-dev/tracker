import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { ApiError } from "@/api/auth"

export type UserGrant = {
  role_id: string
  department_id: string | null
  department_code: string | null
}

export type UserItem = {
  id: string
  email: string
  display_name: string
  lifecycle_state: string
  roles: string[]
  grants: UserGrant[]
  created_at: string | null
  updated_at: string | null
  deleted_at: string | null
}

export type UserListResponse = {
  users: UserItem[]
  total: number
  limit: number
  offset: number
}

export type UserCreate = {
  email: string
  display_name: string
  password: string
}

export type UserUpdate = {
  display_name?: string
  lifecycle_state?: "active" | "deactivated" | "pending"
}

export type PasswordReset = {
  password: string
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

const listKey = ["admin", "users"] as const

export function useUserList() {
  return useQuery<UserListResponse, ApiError>({
    queryKey: listKey,
    queryFn: () =>
      apiCall<UserListResponse>(
        "/api/admin/users?limit=200",
        { method: "GET" },
        "Load failed",
      ),
  })
}

export function useUserCreate() {
  const qc = useQueryClient()
  return useMutation<UserItem, ApiError, UserCreate>({
    mutationFn: (body) =>
      apiCall<UserItem>(
        "/api/admin/users",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Create failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey })
    },
  })
}

export function useUserUpdate() {
  const qc = useQueryClient()
  return useMutation<
    UserItem,
    ApiError,
    { id: string; body: UserUpdate }
  >({
    mutationFn: ({ id, body }) =>
      apiCall<UserItem>(
        `/api/admin/users/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Update failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey })
    },
  })
}

export function useUserDelete() {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (id) =>
      apiCall<void>(
        `/api/admin/users/${id}`,
        { method: "DELETE" },
        "Delete failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey })
    },
  })
}

export function useUserResetPassword() {
  return useMutation<
    void,
    ApiError,
    { id: string; body: PasswordReset }
  >({
    mutationFn: ({ id, body }) =>
      apiCall<void>(
        `/api/admin/users/${id}/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Reset failed",
      ),
  })
}

export function useUserAdminGrant() {
  const qc = useQueryClient()
  return useMutation<UserItem, ApiError, string>({
    mutationFn: (id) =>
      apiCall<UserItem>(
        `/api/admin/users/${id}/admin`,
        { method: "POST" },
        "Grant failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey })
    },
  })
}

export function useUserAdminRevoke() {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (id) =>
      apiCall<void>(
        `/api/admin/users/${id}/admin`,
        { method: "DELETE" },
        "Revoke failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey })
    },
  })
}

export function useUserOrgViewerGrant() {
  const qc = useQueryClient()
  return useMutation<UserItem, ApiError, string>({
    mutationFn: (id) =>
      apiCall<UserItem>(
        `/api/admin/users/${id}/org-viewer`,
        { method: "POST" },
        "Grant failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey })
    },
  })
}

export function useUserOrgViewerRevoke() {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (id) =>
      apiCall<void>(
        `/api/admin/users/${id}/org-viewer`,
        { method: "DELETE" },
        "Revoke failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey })
    },
  })
}
