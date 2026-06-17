import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { ApiError } from "@/api/auth"

export type Template = {
  id: string
  name: string
  department_id: string
  client_id: string
  discipline_id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type TemplateListResponse = {
  items: Template[]
  total: number
  limit: number
  offset: number
}

export type TemplateCreate = {
  name: string
  department_id: string
  client_id: string
  discipline_id: string
}

export type TemplateUpdate = {
  name?: string
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

const listKey = ["templates"] as const

export function useTemplateList() {
  return useQuery<TemplateListResponse, ApiError>({
    queryKey: listKey,
    queryFn: () =>
      apiCall<TemplateListResponse>(
        "/api/admin/templates?limit=200",
        { method: "GET" },
        "Load failed",
      ),
  })
}

export function useTemplateCreate() {
  const qc = useQueryClient()
  return useMutation<Template, ApiError, TemplateCreate>({
    mutationFn: (body) =>
      apiCall<Template>(
        "/api/admin/templates",
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

export function useTemplateUpdate() {
  const qc = useQueryClient()
  return useMutation<
    Template,
    ApiError,
    { id: string; body: TemplateUpdate }
  >({
    mutationFn: ({ id, body }) =>
      apiCall<Template>(
        `/api/admin/templates/${id}`,
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

export function useTemplateDelete() {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (id) =>
      apiCall<void>(
        `/api/admin/templates/${id}`,
        { method: "DELETE" },
        "Delete failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey })
    },
  })
}

export function useTemplate(id: string | undefined) {
  return useQuery<Template, ApiError>({
    queryKey: ["templates", id],
    queryFn: () =>
      apiCall<Template>(
        `/api/admin/templates/${id}`,
        { method: "GET" },
        "Load failed",
      ),
    enabled: !!id,
  })
}

// ---- field defs ---------------------------------------------------------

export type FieldDef = {
  id: string
  template_id: string
  name: string
  field_type: string
  required: boolean
  // Phase 5.2: surface this field in the project-list peek panel
  // metric grid + the project detail right sidebar's Metrics block.
  is_project_metric: boolean
  order_index: number
  options: { choices: string[] } | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type FieldDefListResponse = { items: FieldDef[]; total: number }

export type FieldDefCreate = {
  name: string
  field_type: string
  required: boolean
  is_project_metric?: boolean
  order_index: number
  options: { choices: string[] } | null
}

const fieldsKey = (tid: string) => ["templates", tid, "fields"] as const

export function useFieldDefs(tid: string | undefined) {
  return useQuery<FieldDefListResponse, ApiError>({
    queryKey: fieldsKey(tid ?? ""),
    queryFn: () =>
      apiCall<FieldDefListResponse>(
        `/api/admin/templates/${tid}/fields`,
        { method: "GET" },
        "Load failed",
      ),
    enabled: !!tid,
  })
}

export function useFieldDefCreate(tid: string) {
  const qc = useQueryClient()
  return useMutation<FieldDef, ApiError, FieldDefCreate>({
    mutationFn: (body) =>
      apiCall<FieldDef>(
        `/api/admin/templates/${tid}/fields`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Create failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fieldsKey(tid) })
    },
  })
}

export function useFieldDefUpdate(tid: string) {
  const qc = useQueryClient()
  return useMutation<FieldDef, ApiError, { id: string; body: FieldDefCreate }>({
    mutationFn: ({ id, body }) =>
      apiCall<FieldDef>(
        `/api/admin/templates/${tid}/fields/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Update failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fieldsKey(tid) })
    },
  })
}

export function useFieldDefDelete(tid: string) {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (id) =>
      apiCall<void>(
        `/api/admin/templates/${tid}/fields/${id}`,
        { method: "DELETE" },
        "Delete failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fieldsKey(tid) })
    },
  })
}

// ---- milestone defs -----------------------------------------------------

export type MilestoneDef = {
  id: string
  template_id: string
  name: string
  direction: string
  date_model: string
  order_index: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type MilestoneDefListResponse = { items: MilestoneDef[]; total: number }

export type MilestoneDefCreate = {
  name: string
  direction: string
  date_model: string
  order_index: number
}

const milestonesKey = (tid: string) =>
  ["templates", tid, "milestones"] as const

export function useMilestoneDefs(tid: string | undefined) {
  return useQuery<MilestoneDefListResponse, ApiError>({
    queryKey: milestonesKey(tid ?? ""),
    queryFn: () =>
      apiCall<MilestoneDefListResponse>(
        `/api/admin/templates/${tid}/milestones`,
        { method: "GET" },
        "Load failed",
      ),
    enabled: !!tid,
  })
}

export function useMilestoneDefCreate(tid: string) {
  const qc = useQueryClient()
  return useMutation<MilestoneDef, ApiError, MilestoneDefCreate>({
    mutationFn: (body) =>
      apiCall<MilestoneDef>(
        `/api/admin/templates/${tid}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Create failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: milestonesKey(tid) })
    },
  })
}

export function useMilestoneDefUpdate(tid: string) {
  const qc = useQueryClient()
  return useMutation<
    MilestoneDef,
    ApiError,
    { id: string; body: MilestoneDefCreate }
  >({
    mutationFn: ({ id, body }) =>
      apiCall<MilestoneDef>(
        `/api/admin/templates/${tid}/milestones/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Update failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: milestonesKey(tid) })
    },
  })
}

export function useMilestoneDefDelete(tid: string) {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (id) =>
      apiCall<void>(
        `/api/admin/templates/${tid}/milestones/${id}`,
        { method: "DELETE" },
        "Delete failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: milestonesKey(tid) })
    },
  })
}

// ---- bulk reorder -------------------------------------------------------

export function useFieldDefReorder(tid: string) {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string[]>({
    mutationFn: (ordered_ids) =>
      apiCall<void>(
        `/api/admin/templates/${tid}/fields/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ordered_ids }),
        },
        "Reorder failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fieldsKey(tid) })
    },
    onError: () => {
      // Roll back optimistic update by refetching.
      qc.invalidateQueries({ queryKey: fieldsKey(tid) })
    },
  })
}

export function useMilestoneDefReorder(tid: string) {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string[]>({
    mutationFn: (ordered_ids) =>
      apiCall<void>(
        `/api/admin/templates/${tid}/milestones/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ordered_ids }),
        },
        "Reorder failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: milestonesKey(tid) })
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: milestonesKey(tid) })
    },
  })
}
