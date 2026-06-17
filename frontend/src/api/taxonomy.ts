import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { ApiError } from "@/api/auth"

export type TaxonomyItem = {
  id: string
  code: string
  name: string
  // Only present for dept-scoped resources (clients, disciplines).
  // Undefined for departments themselves.
  department_id?: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type TaxonomyListResponse = {
  items: TaxonomyItem[]
  total: number
  limit: number
  offset: number
}

export type TaxonomyPath = "departments" | "clients" | "disciplines"

// For departments only.
export type TaxonomyCreate = { code: string; name: string }
// For dept-scoped clients/disciplines.
export type DeptScopedTaxonomyCreate = TaxonomyCreate & {
  department_id: string
}
export type TaxonomyUpdate = { code?: string; name?: string }

export function isDeptScoped(path: TaxonomyPath): boolean {
  return path === "clients" || path === "disciplines"
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
  fallbackError: string,
): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init })
  if (res.status === 204) return undefined as T
  const body = await jsonOrEmpty(res)
  if (!res.ok) {
    throw new ApiError(detailOf(body, fallbackError), res.status)
  }
  return body as T
}

function endpoint(path: TaxonomyPath): string {
  return `/api/admin/${path}`
}

function listQueryKey(path: TaxonomyPath, includeDeleted: boolean) {
  return ["taxonomy", path, { includeDeleted }] as const
}

export function useTaxonomyList(path: TaxonomyPath, includeDeleted: boolean) {
  return useQuery<TaxonomyListResponse, ApiError>({
    queryKey: listQueryKey(path, includeDeleted),
    queryFn: () => {
      const url = `${endpoint(path)}?limit=200&include_deleted=${includeDeleted}`
      return apiCall<TaxonomyListResponse>(url, { method: "GET" }, "Load failed")
    },
  })
}

export function useTaxonomyCreate(path: TaxonomyPath) {
  const qc = useQueryClient()
  return useMutation<
    TaxonomyItem,
    ApiError,
    TaxonomyCreate | DeptScopedTaxonomyCreate
  >({
    mutationFn: (body) =>
      apiCall<TaxonomyItem>(
        endpoint(path),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Create failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["taxonomy", path] })
    },
  })
}

export function useTaxonomyUpdate(path: TaxonomyPath) {
  const qc = useQueryClient()
  return useMutation<
    TaxonomyItem,
    ApiError,
    { id: string; body: TaxonomyUpdate }
  >({
    mutationFn: ({ id, body }) =>
      apiCall<TaxonomyItem>(
        `${endpoint(path)}/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Update failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["taxonomy", path] })
    },
  })
}

export function useTaxonomyDelete(path: TaxonomyPath) {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (id) =>
      apiCall<void>(
        `${endpoint(path)}/${id}`,
        { method: "DELETE" },
        "Delete failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["taxonomy", path] })
    },
  })
}
