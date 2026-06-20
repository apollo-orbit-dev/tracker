import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { Repeat2 } from "lucide-react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { CalendarHolidayItem, CalendarItem } from "@/api/calendar"
import type { CalendarEventItem } from "@/api/events"
import {
  calendarEventColor,
  calendarItemColor,
  calendarItemKey,
  calendarItemLabel,
} from "@/lib/calendar-format"

const MAX_PER_CELL = 4

function itemsByDay(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const m = new Map<string, CalendarItem[]>()
  for (const it of items) {
    const arr = m.get(it.date) ?? []
    arr.push(it)
    m.set(it.date, arr)
  }
  return m
}

function holidaysByDay(holidays: CalendarHolidayItem[]): Map<string, CalendarHolidayItem[]> {
  const m = new Map<string, CalendarHolidayItem[]>()
  for (const h of holidays) {
    const arr = m.get(h.date) ?? []
    arr.push(h)
    m.set(h.date, arr)
  }
  return m
}

/** Entry in the per-day event map: the original item + whether this is a continuation day. */
type EventEntry = { event: CalendarEventItem; isContinuation: boolean }

function eventsByDay(
  events: CalendarEventItem[],
  gridStart: Date,
  gridEnd: Date,
): Map<string, EventEntry[]> {
  const m = new Map<string, EventEntry[]>()
  for (const e of events) {
    const spanStart = parseISO(e.date)
    const spanEnd = parseISO(e.end_date)
    // Clip to the visible grid range
    const clampedStart = spanStart < gridStart ? gridStart : spanStart
    const clampedEnd = spanEnd > gridEnd ? gridEnd : spanEnd
    if (clampedStart > clampedEnd) continue
    const days = eachDayOfInterval({ start: clampedStart, end: clampedEnd })
    for (const day of days) {
      const key = format(day, "yyyy-MM-dd")
      const arr = m.get(key) ?? []
      arr.push({ event: e, isContinuation: key !== e.date })
      m.set(key, arr)
    }
  }
  return m
}

function ItemChip({ item, onSelect }: { item: CalendarItem; onSelect: (i: CalendarItem) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onSelect(item) }}
      className={cn(
        "block w-full rounded px-1 py-0.5 text-left text-xs",
        calendarItemColor(item),
      )}
      title={calendarItemLabel(item)}
    >
      <span className="block truncate">{calendarItemLabel(item)}</span>
      <span className="block truncate text-[10px] leading-tight opacity-70">{item.project_title}</span>
    </button>
  )
}

function EventChip({
  event,
  onEventSelect,
  isContinuation = false,
}: {
  event: CalendarEventItem
  onEventSelect: (e: CalendarEventItem) => void
  isContinuation?: boolean
}) {
  const timeLabel =
    !event.all_day && event.start_time ? event.start_time.slice(0, 5) : null
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onEventSelect(event) }}
      className={cn(
        "block w-full rounded px-1 py-0.5 text-left text-xs",
        calendarEventColor(),
        isContinuation && "opacity-75",
      )}
      title={event.title}
    >
      <span className="flex items-center gap-0.5 truncate">
        {isContinuation ? (
          <span className="shrink-0 opacity-60">›</span>
        ) : (
          event.is_recurring && <Repeat2 className="size-2.5 shrink-0" />
        )}
        <span className="truncate">{event.title}</span>
        {!isContinuation && timeLabel && (
          <span className="shrink-0 opacity-70">{timeLabel}</span>
        )}
      </span>
    </button>
  )
}

export function MonthGrid({
  month,
  items,
  holidays,
  events,
  onSelect,
  onEventSelect,
  onDayClick,
}: {
  month: Date
  items: CalendarItem[]
  holidays: CalendarHolidayItem[]
  events: CalendarEventItem[]
  onSelect: (item: CalendarItem) => void
  onEventSelect: (event: CalendarEventItem) => void
  onDayClick?: (dateKey: string) => void
}) {
  const gridStart = startOfWeek(startOfMonth(month))
  const gridEnd = endOfWeek(endOfMonth(month))
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
  const byDay = itemsByDay(items)
  const byDayHolidays = holidaysByDay(holidays)
  const byDayEvents = eventsByDay(events, gridStart, gridEnd)

  return (
    <div className="grid grid-cols-7 gap-px rounded-md border bg-border">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
        <div key={d} className="bg-background px-2 py-1 text-center text-xs font-medium text-muted-foreground">
          {d}
        </div>
      ))}
      {days.map((day) => {
        const key = format(day, "yyyy-MM-dd")
        const dayItems = byDay.get(key) ?? []
        const dayHolidays = byDayHolidays.get(key) ?? []
        const dayEvents = byDayEvents.get(key) ?? []
        // Events render before items; both count toward MAX_PER_CELL
        const allClickable = [
          ...dayEvents.map((entry) => ({ _type: "event" as const, entry })),
          ...dayItems.map((i) => ({ _type: "item" as const, i })),
        ]
        const overflow = allClickable.slice(MAX_PER_CELL)
        return (
          <div
            key={key}
            data-day={key}
            className={cn(
              "group min-h-36 cursor-pointer bg-background p-1 align-top",
              !isSameMonth(day, month) && "bg-muted/40 text-muted-foreground",
              dayHolidays.length > 0 && "bg-teal-50/60 dark:bg-teal-500/15",
            )}
            onClick={() => onDayClick?.(key)}
          >
            <div className="mb-1 flex justify-end">
              <span
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-full text-xs transition-colors group-hover:bg-primary/20",
                  isToday(day) && "font-bold text-primary",
                )}
              >
                {format(day, "d")}
              </span>
            </div>
            <div className="space-y-0.5">
              {dayHolidays.map((h) => (
                <div
                  key={`holiday:${h.date}:${h.country}`}
                  className="truncate text-[10px] font-medium text-teal-700/80 dark:text-teal-300"
                  title={h.name}
                >
                  {h.name}
                </div>
              ))}
              {allClickable.slice(0, MAX_PER_CELL).map((c) =>
                c._type === "event" ? (
                  <EventChip
                    key={`event:${c.entry.event.event_id}:${key}`}
                    event={c.entry.event}
                    onEventSelect={onEventSelect}
                    isContinuation={c.entry.isContinuation}
                  />
                ) : (
                  <ItemChip key={calendarItemKey(c.i)} item={c.i} onSelect={onSelect} />
                ),
              )}
              {overflow.length > 0 && (
                <Popover>
                  <PopoverTrigger
                    className="w-full rounded px-1 text-left text-xs text-muted-foreground hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    +{overflow.length} more
                  </PopoverTrigger>
                  <PopoverContent className="w-56 space-y-0.5 p-1">
                    {allClickable.map((c) =>
                      c._type === "event" ? (
                        <EventChip
                          key={`event:${c.entry.event.event_id}:${key}`}
                          event={c.entry.event}
                          onEventSelect={onEventSelect}
                          isContinuation={c.entry.isContinuation}
                        />
                      ) : (
                        <ItemChip key={calendarItemKey(c.i)} item={c.i} onSelect={onSelect} />
                      ),
                    )}
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
