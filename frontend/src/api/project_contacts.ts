import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { ApiError } from "@/api/auth"

export type ContactSummary = {
  id: string
  name: string
  email: string | null
  phone: string | null
  organization: string | null
}

export type ProjectContact = {
  id: string
  project_id: string
  contact_id: string
  role: string
  contact: ContactSummary
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type ProjectContactListResponse = {
  items: ProjectContact[]
  total: number
}

export type ProjectContactCreate = {
  contact_id: string
  role: string
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

const key = (pid: string) => ["projects", pid, "contacts"] as const

export function useProjectContactList(pid: string | undefined) {
  return useQuery<ProjectContactListResponse, ApiError>({
    queryKey: key(pid ?? ""),
    queryFn: () =>
      apiCall<ProjectContactListResponse>(
        `/api/projects/${pid}/contacts`,
        { method: "GET" },
        "Load failed",
      ),
    enabled: !!pid,
  })
}

export function useProjectContactAttach(pid: string) {
  const qc = useQueryClient()
  return useMutation<ProjectContact, ApiError, ProjectContactCreate>({
    mutationFn: (body) =>
      apiCall<ProjectContact>(
        `/api/projects/${pid}/contacts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Attach failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(pid) })
    },
  })
}

export function useProjectContactUpdate(pid: string) {
  const qc = useQueryClient()
  return useMutation<
    ProjectContact,
    ApiError,
    { id: string; role: string }
  >({
    mutationFn: ({ id, role }) =>
      apiCall<ProjectContact>(
        `/api/projects/${pid}/contacts/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        },
        "Update failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(pid) })
    },
  })
}

export function useProjectContactDetach(pid: string) {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (id) =>
      apiCall<void>(
        `/api/projects/${pid}/contacts/${id}`,
        { method: "DELETE" },
        "Detach failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(pid) })
    },
  })
}
