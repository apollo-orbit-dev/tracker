import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { ApiError } from "@/api/auth"

export type Contact = {
  id: string
  department_id: string
  name: string
  email: string | null
  phone: string | null
  organization: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type ContactListResponse = {
  items: Contact[]
  total: number
  limit: number
  offset: number
}

export type ContactCreate = {
  department_id: string
  name: string
  email?: string | null
  phone?: string | null
  organization?: string | null
}

export type ContactUpdate = Partial<Omit<ContactCreate, "department_id">>

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

const listKey = ["contacts"] as const

export function useContactList() {
  return useQuery<ContactListResponse, ApiError>({
    queryKey: listKey,
    queryFn: () =>
      apiCall<ContactListResponse>(
        "/api/admin/contacts?limit=200",
        { method: "GET" },
        "Load failed",
      ),
  })
}

export function useContactCreate() {
  const qc = useQueryClient()
  return useMutation<Contact, ApiError, ContactCreate>({
    mutationFn: (body) =>
      apiCall<Contact>(
        "/api/admin/contacts",
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

export function useContactUpdate() {
  const qc = useQueryClient()
  return useMutation<
    Contact,
    ApiError,
    { id: string; body: ContactUpdate }
  >({
    mutationFn: ({ id, body }) =>
      apiCall<Contact>(
        `/api/admin/contacts/${id}`,
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

export function useContactDelete() {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (id) =>
      apiCall<void>(
        `/api/admin/contacts/${id}`,
        { method: "DELETE" },
        "Delete failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey })
    },
  })
}
