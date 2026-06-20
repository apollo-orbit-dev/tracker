import { useQuery } from "@tanstack/react-query"

import { ApiError } from "@/api/auth"

export type CalendarMilestoneItem = {
  type: "milestone"
  id: string
  date: string
  name: string
  direction: string
  completed: boolean
  actual_date: string | null
  project_id: string
  project_title: string
}

export type CalendarAssignmentItem = {
  type: "assignment"
  id: string
  date: string
  description: string
  status: string
  assignee_name: string
  milestone_id: string | null
  milestone_name: string | null
  project_id: string
  project_title: string
}

export type CalendarItem = CalendarMilestoneItem | CalendarAssignmentItem
export type CalendarItemsResponse = { items: CalendarItem[] }

export type CalendarItemType = "milestone" | "assignment"

export type CalendarItemsParams = {
  start: string
  end: string
  department_id?: string | null
  client_id?: string | null
  discipline_id?: string | null
  types?: CalendarItemType[]
}

function qs(p: CalendarItemsParams): string {
  const u = new URLSearchParams()
  u.set("start", p.start)
  u.set("end", p.end)
  if (p.department_id) u.set("department_id", p.department_id)
  if (p.client_id) u.set("client_id", p.client_id)
  if (p.discipline_id) u.set("discipline_id", p.discipline_id)
  if (p.types && p.types.length) u.set("types", p.types.join(","))
  return u.toString()
}

export type CalendarHolidayItem = {
  type: "holiday"
  date: string
  name: string
  country: string
}
export type CalendarHolidaysResponse = { items: CalendarHolidayItem[] }

export type CalendarHolidaysParams = { start: string; end: string }

export function useCalendarHolidays(params: CalendarHolidaysParams | null) {
  return useQuery<CalendarHolidaysResponse, ApiError>({
    queryKey: ["calendar", "holidays", params],
    queryFn: async () => {
      const u = new URLSearchParams({ start: params!.start, end: params!.end })
      const res = await fetch(`/api/calendar/holidays?${u.toString()}`, { credentials: "include" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const detail =
          body && typeof body === "object" && "detail" in body
            ? String((body as { detail: unknown }).detail)
            : "Load failed"
        throw new ApiError(detail, res.status)
      }
      return body as CalendarHolidaysResponse
    },
    enabled: !!params,
  })
}

export function useCalendarItems(params: CalendarItemsParams | null) {
  return useQuery<CalendarItemsResponse, ApiError>({
    queryKey: ["calendar", "items", params],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/items?${qs(params!)}`, {
        credentials: "include",
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const detail =
          body && typeof body === "object" && "detail" in body
            ? String((body as { detail: unknown }).detail)
            : "Load failed"
        throw new ApiError(detail, res.status)
      }
      return body as CalendarItemsResponse
    },
    enabled: !!params,
  })
}
