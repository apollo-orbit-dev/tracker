import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { ApiError } from "@/api/auth"

export type NoteAuthor = {
  id: string
  email: string
  display_name: string
}

export type Note = {
  id: string
  project_id: string
  body: string
  created_by: NoteAuthor
  created_at: string
  updated_at: string
}

export type NoteListResponse = {
  items: Note[]
  total: number
  limit: number
  offset: number
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

const listKey = (
  pid: string,
  page: { limit: number; offset: number },
) => ["projects", pid, "notes", page] as const

// Internal key for invalidating ALL notes pages on mutation success.
const notesScope = (pid: string) => ["projects", pid, "notes"] as const

export function useNoteList(
  pid: string | undefined,
  page: { limit: number; offset: number } = { limit: 5, offset: 0 },
) {
  return useQuery<NoteListResponse, ApiError>({
    queryKey: listKey(pid ?? "", page),
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(page.limit),
        offset: String(page.offset),
      })
      return apiCall<NoteListResponse>(
        `/api/projects/${pid}/notes?${params.toString()}`,
        { method: "GET" },
        "Load failed",
      )
    },
    enabled: !!pid,
  })
}

export function useNoteCreate(pid: string) {
  const qc = useQueryClient()
  return useMutation<Note, ApiError, { body: string }>({
    mutationFn: ({ body }) =>
      apiCall<Note>(
        `/api/projects/${pid}/notes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
        "Post failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notesScope(pid) })
      // Dashboard's Recent Activity widget mirrors notes — keep it fresh.
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}

export function useNoteUpdate(pid: string) {
  const qc = useQueryClient()
  return useMutation<Note, ApiError, { id: string; body: string }>({
    mutationFn: ({ id, body }) =>
      apiCall<Note>(
        `/api/projects/${pid}/notes/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
        "Update failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notesScope(pid) })
      // Dashboard's Recent Activity widget mirrors notes — keep it fresh.
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}

export function useNoteDelete(pid: string) {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (id) =>
      apiCall<void>(
        `/api/projects/${pid}/notes/${id}`,
        { method: "DELETE" },
        "Delete failed",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notesScope(pid) })
      // Dashboard's Recent Activity widget mirrors notes — keep it fresh.
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}
