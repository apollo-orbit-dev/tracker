import { eachDayOfInterval, format, parseISO } from "date-fns"
import { Repeat2 } from "lucide-react"

import { cn } from "@/lib/utils"
import type { CalendarHolidayItem, CalendarItem } from "@/api/calendar"
import type { CalendarEventItem } from "@/api/events"
import { AssignmentStatusBadge } from "@/components/AssignmentStatusBadge"
import {
  calendarItemAccent,
  calendarItemKey,
  calendarItemLabel,
} from "@/lib/calendar-format"

export function AgendaList({
  items,
  holidays,
  events,
  onSelect,
  onEventSelect,
}: {
  items: CalendarItem[]
  holidays: CalendarHolidayItem[]
  events: CalendarEventItem[]
  onSelect: (item: CalendarItem) => void
  onEventSelect: (event: CalendarEventItem) => void
}) {
  // Build holiday map for quick lookup
  const holidaysByDay = new Map<string, CalendarHolidayItem[]>()
  for (const h of holidays) {
    const arr = holidaysByDay.get(h.date) ?? []
    arr.push(h)
    holidaysByDay.set(h.date, arr)
  }

  // Build event map for quick lookup — spread multi-day events across every day in their span
  type EventEntry = { event: CalendarEventItem; isContinuation: boolean }
  const eventsByDay = new Map<string, EventEntry[]>()
  for (const e of events) {
    const spanStart = parseISO(e.date)
    const spanEnd = parseISO(e.end_date)
    if (spanEnd < spanStart) continue // guard: corrupt data would crash eachDayOfInterval
    const days = eachDayOfInterval({ start: spanStart, end: spanEnd })
    for (const day of days) {
      const key = format(day, "yyyy-MM-dd")
      const arr = eventsByDay.get(key) ?? []
      arr.push({ event: e, isContinuation: key !== e.date })
      eventsByDay.set(key, arr)
    }
  }

  // Collect all days from items, holidays, and events
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date))
  const groups = new Map<string, CalendarItem[]>()
  for (const it of sorted) {
    const arr = groups.get(it.date) ?? []
    arr.push(it)
    groups.set(it.date, arr)
  }
  // Ensure days with only holidays appear too
  for (const h of holidays) {
    if (!groups.has(h.date)) {
      groups.set(h.date, [])
    }
  }
  // Ensure days with only events appear too (including continuation days)
  for (const [day] of eventsByDay) {
    if (!groups.has(day)) {
      groups.set(day, [])
    }
  }

  // Sort all days
  const allDays = [...groups.keys()].sort()

  if (items.length === 0 && holidays.length === 0 && events.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nothing scheduled.</p>
  }
  return (
    <div className="space-y-4">
      {allDays.map((day) => {
        const dayItems = groups.get(day) ?? []
        const dayHolidays = holidaysByDay.get(day) ?? []
        const dayEventEntries = eventsByDay.get(day) ?? []
        return (
          <div key={day}>
            <h3 className="mb-1 text-sm font-medium text-muted-foreground">
              {format(parseISO(day), "EEE, MMM d, yyyy")}
            </h3>
            <div className="space-y-1">
              {dayHolidays.map((h) => (
                <div key={`holiday:${h.date}:${h.country}`} className="px-3 py-1 text-xs font-medium text-teal-700/80 dark:text-teal-300">
                  {h.name}
                </div>
              ))}
              {dayEventEntries.map(({ event: ev, isContinuation }) => {
                const timeLabel = !ev.all_day && ev.start_time ? ev.start_time.slice(0, 5) : null
                return (
                  <button
                    key={`event:${ev.event_id}:${day}`}
                    type="button"
                    onClick={() => onEventSelect(ev)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left hover:bg-accent",
                      isContinuation && "opacity-75",
                    )}
                  >
                    <span className={cn("mt-1 size-2 shrink-0 rounded-full bg-violet-500", isContinuation && "opacity-60")} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 truncate text-sm font-medium">
                        {isContinuation ? (
                          <span className="text-muted-foreground">›</span>
                        ) : (
                          ev.is_recurring && <Repeat2 className="size-3 shrink-0 text-violet-500" />
                        )}
                        {ev.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {isContinuation ? "Continues" : (timeLabel ? timeLabel : "All day")}
                        {ev.about_user_name ? ` · ${ev.about_user_name}` : ""}
                      </p>
                    </div>
                  </button>
                )
              })}
              {dayItems.map((it) => (
                <button
                  key={calendarItemKey(it)}
                  type="button"
                  onClick={() => onSelect(it)}
                  className="flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left hover:bg-accent"
                >
                  <span
                    className={cn(
                      "mt-1 size-2 shrink-0 rounded-full bg-current",
                      calendarItemAccent(it),
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{calendarItemLabel(it)}</p>
                    {it.type === "milestone" ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {it.project_title} · {it.direction}
                        {it.completed ? " · ✓ done" : ""}
                      </p>
                    ) : (
                      <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <span className="truncate">{it.project_title} · {it.assignee_name}</span>
                        <AssignmentStatusBadge status={it.status} />
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
