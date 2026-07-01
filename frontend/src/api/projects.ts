import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { ApiError } from "@/api/auth"
import type { FieldDef } from "@/api/templates"
import type { MetricCondition } from "@/api/views"

export type Project = {
  id: string
  project_number: string
  client_project_number: string | null
  title: string
  template_id: string
  lifecycle_state: string
  custom_field_values: Record<string, unknown>
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  // Phase 3.0.3: embedded template metadata so list/detail views render
  // for direct-grant users (who can't read /api/admin/templates).
  template_name: string
  template_intersection: string
}

export type Milestone = {
  id: string
  project_id: string
  template_milestone_def_id: string | null
  name: string
  direction: string
  date_model: string
  planned_date: string | null
  actual_date: string | null
  order_index: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type ProjectDetail = Project & {
  milestones: Milestone[]
  valid_next_states: string[]
  // Phase 3.0.2: per-project edit permission for the current user.
  // True iff the user satisfies project_editor+ in this project's dept.
  can_edit: boolean
  // Phase 3.0.3: per-project access-management permission. True iff
  // the user is org admin OR department_manager+ in this project's dept.
  can_manage_access: boolean
  // Phase 3.0.3: live field defs for the project's template, embedded
  // so direct-grant users can render custom fields without dept-scope
  // access to /api/admin/templates/{tid}/fields.
  template_field_defs: FieldDef[]
}

export type RefLabels = {
  users: Record<string, string>
  contacts: Record<string, string>
  projects: Record<string, string>
  clients: Record<string, string>
}

// New union — list endpoint may include milestones per item when
// `expand_milestones=true` is requested.
export type ProjectListItem = Project & {
  milestones?: Milestone[]
}

export type ProjectListResponse = {
  items: ProjectListItem[]
  total: number
  limit: number
  offset: number
  ref_labels?: RefLabels
}

export type ProjectCreate = {
  project_number: string
  client_project_number?: string | null
  title: string
  template_id: string
  custom_field_values?: Record<string, unknown>
}

export type ProjectUpdate = {
  project_number?: string
  client_project_number?: string | null
  title?: string
  custom_field_values?: Record<string, unknown>
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
  // detail can also be an array (list of reasons from the server)
  if (
    body &&
    typeof body === "object" &&
    "detail" in body &&
    Array.isArray((body as { detail: unknown }).detail)
  ) {
    const arr = (body as { detail: unknown[] }).detail
    return arr.map((x) => String(x)).join("; ") || fallback
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

// Phase 27.3: filters that became multi-select accept either a single value
// (existing single-select callers, e.g. the table block) or an array; each
// element is emitted as a repeated query param the backend collects with IN.
export type MultiFilter = string | string[]

export type ProjectListFilters = {
  lifecycle_state?: MultiFilter
  q?: string
  page?: number  // 1-based
  page_size?: number
  template_id?: string
  // Phase 4.8.14: dept / client / discipline filters narrow via the
  // project's template, served by the same /api/projects endpoint.
  department_id?: MultiFilter
  client_id?: MultiFilter
  discipline_id?: MultiFilter
  sort?: string
  sort_direction?: "asc" | "desc"
  expand_refs?: boolean
  expand_milestones?: boolean
  // Phase 7.18 — project field conditions (MetricConditions shape),
  // JSON-encoded into the `conditions` query param. Only sent when
  // items is non-empty; the server requires template_id alongside it.
  conditions?: { combinator: "and" | "or"; items: MetricCondition[] }
}

const listKey = (filters: ProjectListFilters) =>
  ["projects", filters] as const

// Append a single-or-array filter as repeated query params, skipping
// empty values. `?department_id=a&department_id=b` → backend list[UUID].
function appendMulti(
  params: URLSearchParams,
  key: string,
  value: MultiFilter | undefined,
): void {
  if (value === undefined) return
  for (const v of Array.isArray(value) ? value : [value]) {
    if (v) params.append(key, v)
  }
}

export function useProjectList(filters: ProjectListFilters = {}) {
  return useQuery<ProjectListResponse, ApiError>({
    queryKey: listKey(filters),
    queryFn: () => {
      const pageSize = filters.page_size ?? 15
      const page = Math.max(1, filters.page ?? 1)
      const offset = (page - 1) * pageSize
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
      })
      appendMulti(params, "lifecycle_state", filters.lifecycle_state)
      if (filters.q && filters.q.trim()) {
        params.set("q", filters.q.trim())
      }
      if (filters.template_id) {
        params.set("template_id", filters.template_id)
      }
      appendMulti(params, "department_id", filters.department_id)
      appendMulti(params, "client_id", filters.client_id)
      appendMulti(params, "discipline_id", filters.discipline_id)
      if (filters.sort) {
        params.set("sort", filters.sort)
        params.set("sort_direction", filters.sort_direction ?? "desc")
      }
      if (filters.expand_refs) {
        params.set("expand_refs", "true")
      }
      if (filters.expand_milestones) {
        params.set("expand_milestones", "true")
      }
      if (filters.conditions && filters.conditions.items.length > 0) {
        params.set("conditions", JSON.stringify(filters.conditions))
      }
      return apiCall<ProjectListResponse>(
        `/api/projects?${params.toString()}`,
        { method: "GET" },
        "Load failed",
      )
    },
  })
}

export function useProject(id: string | undefined) {
  return useQuery<ProjectDetail, ApiError>({
    queryKey: ["projects", id],
    queryFn: () =>
      apiCall<ProjectDetail>(
        `/api/projects/${id}`,
        { method: "GET" },
        "Load failed",
      ),
    enabled: !!id,
  })
}

export function useProjectCreate() {
  const qc = useQueryClient()
  return useMutation<ProjectDetail, ApiError, ProjectCreate>({
    mutationFn: (body) =>
      apiCall<ProjectDetail>(
        "/api/projects",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Create failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}

// Phase 5.3 — spreadsheet import response shape.

export type ImportSkipped = {
  row: number
  project_number: string
  reason: string
}

export type ImportError = {
  row: number
  error: string
}

export type ImportResult = {
  created: number
  skipped: ImportSkipped[]
  errors: ImportError[]
}

export function useProjectImport() {
  const qc = useQueryClient()
  return useMutation<
    ImportResult,
    ApiError,
    { file: File; templateId: string; mapping: Record<string, string> }
  >({
    mutationFn: async ({ file, templateId, mapping }) => {
      const form = new FormData()
      form.append("file", file)
      form.append("template_id", templateId)
      form.append("mapping", JSON.stringify(mapping))
      // apiCall sets Content-Type to JSON — multipart is different,
      // so call fetch directly here.
      const res = await fetch("/api/projects/import", {
        method: "POST",
        body: form,
        credentials: "include",
      })
      if (!res.ok) {
        let detail = "Import failed"
        try {
          const body = await res.json()
          if (typeof body?.detail === "string") detail = body.detail
        } catch {
          // ignore JSON parse errors; use the default detail
        }
        throw new ApiError(detail, res.status)
      }
      return (await res.json()) as ImportResult
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}

// Phase 5.4 — Saved-View CSV / XLSX export.

export type ExportFormat = "csv" | "xlsx"

export type ProjectExportRequest = {
  templateId: string
  format: ExportFormat
  columns: string[]
  lifecycle_state?: MultiFilter
  q?: string
  sort?: string
  sort_direction?: "asc" | "desc"
  department_id?: MultiFilter
  client_id?: MultiFilter
  discipline_id?: MultiFilter
}

function filenameFromHeader(
  res: Response,
  fallback: string,
): string {
  const cd = res.headers.get("content-disposition") || ""
  const match = cd.match(/filename="([^"]+)"/)
  return match ? match[1] : fallback
}

export async function exportProjects(
  req: ProjectExportRequest,
): Promise<{ blob: Blob; filename: string }> {
  const params = new URLSearchParams({
    template_id: req.templateId,
    format: req.format,
    columns: req.columns.join(","),
  })
  appendMulti(params, "lifecycle_state", req.lifecycle_state)
  if (req.q && req.q.trim()) params.set("q", req.q.trim())
  if (req.sort) {
    params.set("sort", req.sort)
    params.set("sort_direction", req.sort_direction ?? "desc")
  }
  appendMulti(params, "department_id", req.department_id)
  appendMulti(params, "client_id", req.client_id)
  appendMulti(params, "discipline_id", req.discipline_id)
  const res = await fetch(`/api/projects/export?${params.toString()}`, {
    method: "GET",
    credentials: "include",
  })
  if (!res.ok) {
    let detail = "Export failed"
    try {
      const body = await res.json()
      if (typeof body?.detail === "string") detail = body.detail
    } catch {
      // ignore parse errors
    }
    throw new ApiError(detail, res.status)
  }
  const blob = await res.blob()
  const filename = filenameFromHeader(
    res,
    `projects.${req.format}`,
  )
  return { blob, filename }
}

export function useProjectExport() {
  return useMutation<
    { blob: Blob; filename: string },
    ApiError,
    ProjectExportRequest
  >({
    mutationFn: exportProjects,
  })
}

export function useProjectUpdate() {
  const qc = useQueryClient()
  return useMutation<
    ProjectDetail,
    ApiError,
    { id: string; body: ProjectUpdate }
  >({
    mutationFn: ({ id, body }) =>
      apiCall<ProjectDetail>(
        `/api/projects/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Update failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}

export function useProjectDelete() {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (id) =>
      apiCall<void>(
        `/api/projects/${id}`,
        { method: "DELETE" },
        "Delete failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}

export type MilestoneUpdateBody = {
  name?: string
  direction?: string
  date_model?: string
  order_index?: number
  planned_date?: string | null
  actual_date?: string | null
}

export type MilestoneCreateBody = {
  name: string
  direction: string
  date_model: string
}

export function useMilestoneUpdate(pid: string) {
  const qc = useQueryClient()
  return useMutation<
    Milestone,
    ApiError,
    { id: string; body: MilestoneUpdateBody }
  >({
    mutationFn: ({ id, body }) =>
      apiCall<Milestone>(
        `/api/projects/${pid}/milestones/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Update failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", pid] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}

export function useMilestoneCreate(pid: string) {
  const qc = useQueryClient()
  return useMutation<Milestone, ApiError, MilestoneCreateBody>({
    mutationFn: (body) =>
      apiCall<Milestone>(
        `/api/projects/${pid}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Create failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", pid] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}

export function useMilestoneDelete(pid: string) {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (id) =>
      apiCall<void>(
        `/api/projects/${pid}/milestones/${id}`,
        { method: "DELETE" },
        "Delete failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", pid] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}

export function useMilestoneReorder(pid: string) {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string[]>({
    mutationFn: (ordered_ids) =>
      apiCall<void>(
        `/api/projects/${pid}/milestones/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ordered_ids }),
        },
        "Reorder failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", pid] })
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ["projects", pid] })
    },
  })
}

export function useProjectTransition(pid: string) {
  const qc = useQueryClient()
  return useMutation<ProjectDetail, ApiError, string>({
    mutationFn: (to_state) =>
      apiCall<ProjectDetail>(
        `/api/projects/${pid}/transition`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to_state }),
        },
        "Transition failed",
      ),
    onSuccess: (data) => {
      qc.setQueryData(["projects", pid], data)
      qc.invalidateQueries({ queryKey: ["projects"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}
