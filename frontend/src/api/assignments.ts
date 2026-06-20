import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@/api/auth"

export type Assignment = {
  id: string
  project_id: string
  milestone_id: string | null
  milestone_name: string | null
  assignee_user_id: string
  assignee_name: string
  assignee_email: string
  description: string
  status: string
  due_date: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type AssignmentListResponse = { items: Assignment[]; total: number }

export type AssignmentCreate = {
  description: string
  assignee_user_id: string
  milestone_id?: string | null
  due_date?: string | null
  status?: string
}

export type AssignmentUpdate = Partial<AssignmentCreate>

export type EligibleUser = { id: string; email: string; display_name: string }
export type EligibleUsersResponse = { items: EligibleUser[]; total: number }

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

const key = (pid: string) => ["projects", pid, "assignments"] as const

export function useAssignmentList(pid: string | undefined) {
  return useQuery<AssignmentListResponse, ApiError>({
    queryKey: key(pid ?? ""),
    queryFn: () =>
      apiCall<AssignmentListResponse>(
        `/api/projects/${pid}/assignments`,
        { method: "GET" },
        "Load failed",
      ),
    enabled: !!pid,
  })
}

export function useEligibleAssignees(pid: string | undefined) {
  return useQuery<EligibleUsersResponse, ApiError>({
    queryKey: ["projects", pid ?? "", "assignments", "eligible-users"],
    queryFn: () =>
      apiCall<EligibleUsersResponse>(
        `/api/projects/${pid}/assignments/eligible-users`,
        { method: "GET" },
        "Load failed",
      ),
    enabled: !!pid,
  })
}

export function useAssignmentCreate(pid: string) {
  const qc = useQueryClient()
  return useMutation<Assignment, ApiError, AssignmentCreate>({
    mutationFn: (body) =>
      apiCall<Assignment>(
        `/api/projects/${pid}/assignments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Create failed",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(pid) }),
  })
}

export function useAssignmentUpdate(pid: string) {
  const qc = useQueryClient()
  return useMutation<Assignment, ApiError, { id: string; body: AssignmentUpdate }>({
    mutationFn: ({ id, body }) =>
      apiCall<Assignment>(
        `/api/projects/${pid}/assignments/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Update failed",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(pid) }),
  })
}

export function useAssignmentDelete(pid: string) {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (id) =>
      apiCall<void>(
        `/api/projects/${pid}/assignments/${id}`,
        { method: "DELETE" },
        "Delete failed",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(pid) }),
  })
}
