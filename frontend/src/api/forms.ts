import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { ApiError } from "@/api/auth"

export type FormField = {
  id: string
  form_id: string
  label: string
  field_type: string
  required: boolean
  help_text: string | null
  placeholder: string | null
  options: { choices?: string[] } | null
  order_index: number
  target_key: string | null
  created_at: string
}

export type Form = {
  id: string
  department_id: string
  name: string
  description: string | null
  target_entity: string | null
  target_template_id: string | null
  status: "draft" | "active" | "archived"
  created_by: string
  created_at: string
  updated_at: string
  fields: FormField[]
}

export type FormListItem = {
  id: string
  department_id: string
  name: string
  target_entity: string | null
  status: string
  updated_at: string
  /** Pending submissions awaiting review; 0 unless the requester can review (#49). */
  pending_count: number
}

export type FormListResponse = {
  items: FormListItem[]
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

// Query keys
const formsListKey = (deptId?: string) =>
  deptId ? (["forms", { dept: deptId }] as const) : (["forms"] as const)
const formsScope = () => ["forms"] as const
const formDetailKey = (id: string) => ["forms", id] as const

export function useFormList(deptId?: string) {
  return useQuery<FormListResponse, ApiError>({
    queryKey: formsListKey(deptId),
    queryFn: () => {
      const params = deptId
        ? "?" + new URLSearchParams({ department_id: deptId }).toString()
        : ""
      return apiCall<FormListResponse>(
        `/api/forms${params}`,
        { method: "GET" },
        "Load failed",
      )
    },
  })
}

export function useForm(id: string | undefined) {
  return useQuery<Form, ApiError>({
    queryKey: formDetailKey(id ?? ""),
    queryFn: () =>
      apiCall<Form>(`/api/forms/${id}`, { method: "GET" }, "Load failed"),
    enabled: !!id,
  })
}

// Phase 27.9 — users in a form's department, for a user-picker field at
// fill-out / review. Reuses the roster UserPickerItem shape.
export type FormUserOption = { id: string; email: string; display_name: string }
export type FormUserOptionsResponse = { items: FormUserOption[]; total: number }

export function useFormUserOptions(formId: string | undefined, enabled = true) {
  return useQuery<FormUserOptionsResponse, ApiError>({
    queryKey: ["forms", formId, "user-options"],
    queryFn: () =>
      apiCall<FormUserOptionsResponse>(
        `/api/forms/${formId}/user-options`,
        { method: "GET" },
        "Load failed",
      ),
    enabled: !!formId && enabled,
    staleTime: 60_000,
  })
}

export function useFormCreate() {
  const qc = useQueryClient()
  return useMutation<
    Form,
    ApiError,
    {
      name: string
      department_id: string
      description?: string | null
      target_entity?: string | null
      target_template_id?: string | null
      status?: "draft" | "active" | "archived"
    }
  >({
    mutationFn: (data) =>
      apiCall<Form>(
        "/api/forms",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
        "Create failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: formsScope() })
    },
  })
}

export function useFormUpdate(id: string) {
  const qc = useQueryClient()
  return useMutation<
    Form,
    ApiError,
    {
      name?: string
      description?: string | null
      target_entity?: string | null
      target_template_id?: string | null
      status?: "draft" | "active" | "archived"
    }
  >({
    mutationFn: (data) =>
      apiCall<Form>(
        `/api/forms/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
        "Update failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: formsScope() })
      qc.invalidateQueries({ queryKey: formDetailKey(id) })
    },
  })
}

export function useFormDelete() {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (id) =>
      apiCall<void>(`/api/forms/${id}`, { method: "DELETE" }, "Delete failed"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: formsScope() })
    },
  })
}

export function useFieldCreate(formId: string) {
  const qc = useQueryClient()
  return useMutation<
    FormField,
    ApiError,
    {
      label: string
      field_type: string
      required?: boolean
      help_text?: string | null
      placeholder?: string | null
      options?: { choices?: string[] } | null
      order_index?: number
      target_key?: string | null
    }
  >({
    mutationFn: (data) =>
      apiCall<FormField>(
        `/api/forms/${formId}/fields`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
        "Create field failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: formDetailKey(formId) })
    },
  })
}

export function useFieldUpdate(formId: string) {
  const qc = useQueryClient()
  return useMutation<
    FormField,
    ApiError,
    {
      id: string
      label?: string
      field_type?: string
      required?: boolean
      help_text?: string | null
      placeholder?: string | null
      options?: { choices?: string[] } | null
      order_index?: number
      target_key?: string | null
    }
  >({
    mutationFn: ({ id, ...data }) =>
      apiCall<FormField>(
        `/api/forms/${formId}/fields/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
        "Update field failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: formDetailKey(formId) })
    },
  })
}

export function useFieldDelete(formId: string) {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (fieldId) =>
      apiCall<void>(
        `/api/forms/${formId}/fields/${fieldId}`,
        { method: "DELETE" },
        "Delete field failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: formDetailKey(formId) })
    },
  })
}

// ── Target registry ───────────────────────────────────────────────────────────

export type FormTargetField = {
  key: string
  label: string
  type: string
  /** Section the field belongs to; the builder groups mapped fields by it (#49). */
  group?: string
}

export type FormTargetDescriptor = {
  label: string
  requires_project: boolean
  fields: FormTargetField[]
}

export type FormTargets = Record<string, FormTargetDescriptor>

/** field_type → abstract compatibility type. Single source of truth lives in
 * the backend (form_targets.py); shipped in the /targets payload (#49). */
export type FieldTypeMap = Record<string, string>

export type FormTargetsResponse = {
  targets: FormTargets
  field_type_map: FieldTypeMap
}

export function useFormTargets() {
  return useQuery<FormTargetsResponse, ApiError>({
    queryKey: ["forms", "targets"] as const,
    queryFn: () =>
      apiCall<FormTargetsResponse>(
        "/api/forms/targets",
        { method: "GET" },
        "Load failed",
      ),
    staleTime: 5 * 60_000,
  })
}

export function useFieldReorder(formId: string) {
  const qc = useQueryClient()
  return useMutation<FormField[], ApiError, { field_ids: string[] }>({
    mutationFn: (data) =>
      apiCall<FormField[]>(
        `/api/forms/${formId}/fields/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
        "Reorder failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: formDetailKey(formId) })
    },
  })
}

// ── Submissions ───────────────────────────────────────────────────────────────

export type ProposedChange = {
  group: string
  target: string
  value: unknown
  field_id: string
}

export type Submission = {
  id: string
  form_id: string
  submitted_by: string
  submitted_by_name: string | null
  values: Record<string, unknown>
  target_project_id: string | null
  status: string
  reviewed_by: string | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  review_note: string | null
  pushed_entity_type: string | null
  pushed_entity_id: string | null
  created_at: string
  updated_at: string
  proposed_changes?: ProposedChange[]
}

export type SubmissionListItem = {
  id: string
  form_id: string
  submitted_by: string
  submitted_by_name: string | null
  target_project_id: string | null
  status: string
  created_at: string
  updated_at: string
}

export type SubmissionListResponse = {
  items: SubmissionListItem[]
  total: number
}

const submissionsKey = (formId: string, status?: string) =>
  ["forms", formId, "submissions", { status }] as const

const submissionDetailKey = (formId: string, sid: string) =>
  ["forms", formId, "submissions", sid] as const

export function useSubmit(formId: string) {
  const qc = useQueryClient()
  return useMutation<
    Submission,
    ApiError,
    { values: Record<string, unknown>; target_project_id?: string | null }
  >({
    mutationFn: (data) =>
      apiCall<Submission>(
        `/api/forms/${formId}/submissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
        "Submit failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forms", formId, "submissions"] })
    },
  })
}

export function useSubmissionList(formId: string, status?: string) {
  return useQuery<SubmissionListResponse, ApiError>({
    queryKey: submissionsKey(formId, status),
    queryFn: () => {
      const params = status
        ? "?" + new URLSearchParams({ status }).toString()
        : ""
      return apiCall<SubmissionListResponse>(
        `/api/forms/${formId}/submissions${params}`,
        { method: "GET" },
        "Load failed",
      )
    },
    enabled: !!formId,
  })
}

export function useSubmission(formId: string, sid: string | undefined) {
  return useQuery<Submission, ApiError>({
    queryKey: submissionDetailKey(formId, sid ?? ""),
    queryFn: () =>
      apiCall<Submission>(
        `/api/forms/${formId}/submissions/${sid}`,
        { method: "GET" },
        "Load failed",
      ),
    enabled: !!formId && !!sid,
  })
}

export type ApproveVariables = {
  sid: string
  final_values: Record<string, unknown>
  target_project_id: string | null
  // null for a collect-only ("General") form (no COR is created).
  cor_number: string | null
  cor_status: string
  // Approval-time assignee for assignment-target forms (Pattern B, Phase 20.2).
  assignee_user_id?: string | null
  // Approval-time milestone structure for milestone-target forms (Phase 20.3).
  milestone_direction?: string | null
  milestone_date_model?: string | null
  // Reviewer-entered project number for intake-target forms (Phase 20.5).
  intake_project_number?: string | null
}

export function useSubmissionApprove(formId: string) {
  const qc = useQueryClient()
  return useMutation<Submission, ApiError, ApproveVariables>({
    mutationFn: ({ sid, ...body }) =>
      apiCall<Submission>(
        `/api/forms/${formId}/submissions/${sid}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Approve failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forms", formId, "submissions"] })
    },
  })
}

export type RejectVariables = {
  sid: string
  review_note: string
}

export function useSubmissionReject(formId: string) {
  const qc = useQueryClient()
  return useMutation<Submission, ApiError, RejectVariables>({
    mutationFn: ({ sid, review_note }) =>
      apiCall<Submission>(
        `/api/forms/${formId}/submissions/${sid}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ review_note }),
        },
        "Reject failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forms", formId, "submissions"] })
    },
  })
}
