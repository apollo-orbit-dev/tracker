import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@/api/auth"
import type { UserPickerResponse } from "@/api/roster"
import type { RecurrenceConfig } from "@/lib/recurrence"

// ── Types ────────────────────────────────────────────────────────────────────

export type EventSeries = {
  id: string
  title: string
  description: string | null
  all_day: boolean
  start_time: string | null
  end_time: string | null
  about_user_id: string | null
  about_user_name: string | null
  department_id: string | null
  start_date: string
  end_date: string | null
  recurrence: RecurrenceConfig | null
  created_at: string
  updated_at: string
}

export type CalendarEventItem = {
  type: "event"
  event_id: string
  original_date: string
  date: string
  end_date: string
  title: string
  description: string | null
  all_day: boolean
  start_time: string | null
  end_time: string | null
  about_user_name: string | null
  is_recurring: boolean
  is_override: boolean
}

export type CalendarEventsParams = {
  start: string
  end: string
  department_id?: string[]
}

export type EventCreate = {
  title: string
  description?: string | null
  all_day?: boolean
  start_time?: string | null
  end_time?: string | null
  end_date?: string | null
  about_user_id?: string | null
  department_id?: string | null
  recurrence?: RecurrenceConfig | null
  start_date: string
}

export type EventUpdate = Partial<Omit<EventCreate, "recurrence">> & {
  recurrence?: RecurrenceConfig | null
}

export type OccurrenceModify = {
  override_date?: string | null
  override_title?: string | null
  override_description?: string | null
  override_all_day?: boolean | null
  override_start_time?: string | null
  override_end_time?: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

const EVENTS_KEY = ["calendar", "events"] as const

// ── Query hooks ───────────────────────────────────────────────────────────────

export function useCalendarEvents(params: CalendarEventsParams | null) {
  return useQuery<{ items: CalendarEventItem[] }, ApiError>({
    queryKey: [...EVENTS_KEY, params],
    queryFn: () => {
      const u = new URLSearchParams({ start: params!.start, end: params!.end })
      for (const id of params!.department_id ?? []) u.append("department_id", id)
      return apiCall<{ items: CalendarEventItem[] }>(
        `/api/calendar/events?${u.toString()}`,
        { method: "GET" },
        "Load failed",
      )
    },
    enabled: !!params,
  })
}

export function useEvent(id: string | null) {
  return useQuery<EventSeries, ApiError>({
    queryKey: [...EVENTS_KEY, "series", id],
    queryFn: () =>
      apiCall<EventSeries>(`/api/events/${id}`, { method: "GET" }, "Load failed"),
    enabled: !!id,
  })
}

export function useEventAboutUserOptions(departmentId: string | undefined) {
  return useQuery<UserPickerResponse, ApiError>({
    queryKey: [...EVENTS_KEY, "about-user-options", departmentId],
    queryFn: () =>
      apiCall<UserPickerResponse>(
        `/api/events/about-user-options?department_id=${departmentId}`,
        { method: "GET" },
        "Load failed",
      ),
    enabled: !!departmentId,
  })
}

// ── Mutation hooks ────────────────────────────────────────────────────────────

export function useEventCreate() {
  const qc = useQueryClient()
  return useMutation<EventSeries, ApiError, EventCreate>({
    mutationFn: (body) =>
      apiCall<EventSeries>(
        "/api/events",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Create failed",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: EVENTS_KEY }),
  })
}

export function useEventUpdate() {
  const qc = useQueryClient()
  return useMutation<EventSeries, ApiError, { id: string; body: EventUpdate }>({
    mutationFn: ({ id, body }) =>
      apiCall<EventSeries>(
        `/api/events/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Update failed",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: EVENTS_KEY }),
  })
}

export function useEventDelete() {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (id) =>
      apiCall<void>(
        `/api/events/${id}`,
        { method: "DELETE" },
        "Delete failed",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: EVENTS_KEY }),
  })
}

export function useOccurrenceCancel(eid: string) {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (date) =>
      apiCall<void>(
        `/api/events/${eid}/occurrences/${date}`,
        { method: "DELETE" },
        "Cancel failed",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: EVENTS_KEY }),
  })
}

export function useOccurrenceModify(eid: string) {
  const qc = useQueryClient()
  return useMutation<CalendarEventItem, ApiError, { date: string; body: OccurrenceModify }>({
    mutationFn: ({ date, body }) =>
      apiCall<CalendarEventItem>(
        `/api/events/${eid}/occurrences/${date}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "Modify failed",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: EVENTS_KEY }),
  })
}
