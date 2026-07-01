import { addDays, format } from "date-fns"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ScheduleView } from "./ScheduleView"
import type { CalendarItem, CalendarHolidayItem } from "@/api/calendar"
import type { CalendarEventItem } from "@/api/events"
import type { CalendarFilters } from "@/components/calendar/types"

const F: CalendarFilters = {
  departmentIds: [],
  clientIds: [],
  disciplineIds: [],
  showMilestones: true,
  showAssignments: true,
  showHolidays: true,
  showEvents: true,
}

const today = new Date()
const key = (n: number) => format(addDays(today, n), "yyyy-MM-dd")

function ms(date: string, over: Partial<CalendarItem> = {}): CalendarItem {
  return {
    type: "milestone", id: `m-${date}-${Math.random()}`, date, name: "MS", direction: "outbound",
    completed: false, actual_date: null, project_id: "p", project_title: "Proj", ...over,
  } as CalendarItem
}

function base(extra: Partial<Parameters<typeof ScheduleView>[0]> = {}) {
  return {
    items: [] as CalendarItem[],
    holidays: [] as CalendarHolidayItem[],
    events: [] as CalendarEventItem[],
    filters: F,
    onFilters: vi.fn(),
    deptOptions: [],
    clientOptions: [],
    disciplineOptions: [],
    onSelect: vi.fn(),
    onEventSelect: vi.fn(),
    ...extra,
  }
}

describe("ScheduleView", () => {
  it("groups upcoming items into Today / This week / Next week / Later", () => {
    const assignment: CalendarItem = {
      type: "assignment", id: "a1", date: key(3), description: "Do thing", status: "in_progress",
      assignee_name: "Bob Editor", milestone_id: null, milestone_name: null, project_id: "p", project_title: "Proj",
    }
    const event: CalendarEventItem = {
      type: "event", event_id: "e1", original_date: key(10), date: key(10), end_date: key(10),
      title: "EventX", description: null, all_day: true, start_time: null, end_time: null,
      about_user_name: null, is_recurring: false, is_override: false,
    }
    const holiday: CalendarHolidayItem = { type: "holiday", date: key(20), name: "Holiday X", country: "US" }
    render(<ScheduleView {...base({ items: [ms(key(0), { name: "TodayMS" }), assignment], events: [event], holidays: [holiday] })} />)

    expect(screen.getByText("Today")).toBeInTheDocument()
    expect(screen.getByText("This week")).toBeInTheDocument()
    expect(screen.getByText("Next week")).toBeInTheDocument()
    expect(screen.getByText("Later")).toBeInTheDocument()
    expect(screen.getByText("TodayMS")).toBeInTheDocument()
    expect(screen.getByText("Do thing")).toBeInTheDocument()      // assignment
    expect(screen.getByText("outbound")).toBeInTheDocument()      // milestone direction
    expect(screen.getByText("EventX")).toBeInTheDocument()
    expect(screen.getByText("Holiday X")).toBeInTheDocument()
  })

  it("excludes past items and shows the empty state", () => {
    render(<ScheduleView {...base({ items: [ms(key(-3), { name: "PastMS" })] })} />)
    expect(screen.queryByText("PastMS")).toBeNull()
    expect(screen.getByText("Nothing scheduled.")).toBeInTheDocument()
  })

  it("calls onSelect when an item row is clicked", () => {
    const onSelect = vi.fn()
    render(<ScheduleView {...base({ items: [ms(key(1), { name: "ClickMe" })], onSelect })} />)
    fireEvent.click(screen.getByText("ClickMe"))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it("renders the mini-month for the current month", () => {
    render(<ScheduleView {...base()} />)
    expect(screen.getByText(format(today, "MMMM yyyy"))).toBeInTheDocument()
  })
})
