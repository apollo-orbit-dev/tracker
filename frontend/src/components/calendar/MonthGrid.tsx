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
import {
  ChevronRight,
  ClipboardList,
  Clock,
  Flag,
  Repeat2,
  Star,
} from "lucide-react"

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

/**
 * Phase 26.1: the project titles on this deployment share a trailing phrase
 * (e.g. "… Substation Upgrade") that's pure noise on a packed chip. Rather
 * than hard-code that phrase, strip the longest *word-suffix common to every
 * visible project title* — generic, and a no-op when titles don't share one
 * (or when there's only one distinct title, so a lone project keeps its name).
 */
function sharedTrailingWords(titles: string[]): string {
  const distinct = [...new Set(titles.filter(Boolean))]
  if (distinct.length < 2) return ""
  const wordLists = distinct.map((t) => t.trim().split(/\s+/))
  const minLen = Math.min(...wordLists.map((w) => w.length))
  const tail: string[] = []
  for (let i = 1; i <= minLen; i++) {
    const word = wordLists[0][wordLists[0].length - i]
    if (wordLists.every((w) => w[w.length - i] === word)) tail.unshift(word)
    else break
  }
  // Never strip so much that a title would be left empty.
  if (tail.length === 0 || wordLists.some((w) => w.length <= tail.length)) return ""
  return tail.join(" ")
}

function stripTail(title: string, tail: string): string {
  if (!tail) return title
  const esc = tail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return title.replace(new RegExp(`\\s+${esc}$`), "")
}

/** Per-day entry: the event + where this day sits within its (clipped) span. */
type EventEntry = {
  event: CalendarEventItem
  isContinuation: boolean
  isStart: boolean
  isEnd: boolean
}

function eventsByDay(
  events: CalendarEventItem[],
  gridStart: Date,
  gridEnd: Date,
): Map<string, EventEntry[]> {
  const m = new Map<string, EventEntry[]>()
  for (const e of events) {
    const spanStart = parseISO(e.date)
    const spanEnd = parseISO(e.end_date)
    const clampedStart = spanStart < gridStart ? gridStart : spanStart
    const clampedEnd = spanEnd > gridEnd ? gridEnd : spanEnd
    if (clampedStart > clampedEnd) continue
    const startKey = format(clampedStart, "yyyy-MM-dd")
    const endKey = format(clampedEnd, "yyyy-MM-dd")
    for (const day of eachDayOfInterval({ start: clampedStart, end: clampedEnd })) {
      const key = format(day, "yyyy-MM-dd")
      const arr = m.get(key) ?? []
      arr.push({
        event: e,
        isContinuation: key !== e.date,
        isStart: key === startKey,
        isEnd: key === endKey,
      })
      m.set(key, arr)
    }
  }
  return m
}

function ItemChip({
  item,
  projectLabel,
  onSelect,
}: {
  item: CalendarItem
  projectLabel: string
  onSelect: (i: CalendarItem) => void
}) {
  const Icon = item.type === "milestone" ? Flag : ClipboardList
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onSelect(item)
      }}
      className={cn(
        "flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-xs",
        calendarItemColor(item),
      )}
      title={`${calendarItemLabel(item)} · ${item.project_title}`}
    >
      <Icon className="size-3 shrink-0 opacity-90" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{calendarItemLabel(item)}</span>
        {projectLabel && (
          <>
            <span className="opacity-40"> · </span>
            <span className="opacity-60">{projectLabel}</span>
          </>
        )}
      </span>
    </button>
  )
}

function EventChip({
  event,
  onEventSelect,
  isContinuation = false,
  isStart = true,
  isEnd = true,
}: {
  event: CalendarEventItem
  onEventSelect: (e: CalendarEventItem) => void
  isContinuation?: boolean
  isStart?: boolean
  isEnd?: boolean
}) {
  const time =
    !event.all_day && event.start_time ? event.start_time.slice(0, 5) : null
  const Lead = isContinuation
    ? ChevronRight
    : event.is_recurring
      ? Repeat2
      : time
        ? Clock
        : null
  const round =
    isStart && isEnd ? "rounded" : isStart ? "rounded-l" : isEnd ? "rounded-r" : "rounded-none"
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onEventSelect(event)
      }}
      className={cn(
        "flex w-full items-center gap-1 px-1.5 py-0.5 text-left text-xs",
        calendarEventColor(),
        round,
        isContinuation && "opacity-75",
      )}
      title={event.title}
    >
      {Lead && (
        <Lead className={cn("size-3 shrink-0", isContinuation && "opacity-60")} />
      )}
      <span className="min-w-0 flex-1 truncate">{event.title}</span>
      {!isContinuation && time && (
        <span className="shrink-0 text-[11px] opacity-70">{time}</span>
      )}
    </button>
  )
}

const LEGEND: [string, string][] = [
  ["Milestones", "bg-indigo-500"],
  ["Assignments", "bg-amber-500"],
  ["Events", "bg-violet-500"],
  ["Holidays", "bg-teal-500"],
]

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
  const tail = sharedTrailingWords(items.map((i) => i.project_title))

  const renderChip = (
    c:
      | { _type: "event"; entry: EventEntry }
      | { _type: "item"; i: CalendarItem },
    key: string,
  ) =>
    c._type === "event" ? (
      <EventChip
        key={`event:${c.entry.event.event_id}:${key}`}
        event={c.entry.event}
        onEventSelect={onEventSelect}
        isContinuation={c.entry.isContinuation}
        isStart={c.entry.isStart}
        isEnd={c.entry.isEnd}
      />
    ) : (
      <ItemChip
        key={calendarItemKey(c.i)}
        item={c.i}
        projectLabel={stripTail(c.i.project_title, tail)}
        onSelect={onSelect}
      />
    )

  return (
    <div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="min-w-0 bg-[hsl(var(--card-2))] px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.03em] text-[hsl(var(--subtle-fg))]"
          >
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd")
          const dayItems = byDay.get(key) ?? []
          const dayHolidays = byDayHolidays.get(key) ?? []
          const dayEvents = byDayEvents.get(key) ?? []
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
                "group flex min-h-32 min-w-0 flex-col gap-0.5 bg-background p-1",
                onDayClick ? "cursor-pointer" : "cursor-default",
                !isSameMonth(day, month) && "bg-muted/40 text-muted-foreground",
                dayHolidays.length > 0 && "bg-teal-50/60 dark:bg-teal-500/15",
              )}
              onClick={onDayClick ? () => onDayClick(key) : undefined}
            >
              <div className="mb-0.5 flex items-start gap-1">
                <div className="min-w-0 flex-1 space-y-0.5 pt-0.5">
                  {dayHolidays.map((h) => (
                    <div
                      key={`holiday:${h.date}:${h.country}`}
                      className="flex items-center gap-1 truncate text-[10px] font-semibold text-teal-700 dark:text-teal-300"
                      title={h.name}
                    >
                      <Star className="size-2.5 shrink-0" />
                      {h.name}
                    </div>
                  ))}
                </div>
                <span
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full text-xs transition-colors",
                    onDayClick && !isToday(day) && "group-hover:bg-primary/20",
                    isToday(day)
                      ? "bg-primary font-bold text-primary-foreground"
                      : "font-medium",
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>
              <div className="space-y-0.5">
                {allClickable.slice(0, MAX_PER_CELL).map((c) => renderChip(c, key))}
                {overflow.length > 0 && (
                  <Popover>
                    <PopoverTrigger
                      className="w-full rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-muted-foreground hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      +{overflow.length} more
                    </PopoverTrigger>
                    <PopoverContent className="w-60 space-y-0.5 p-1">
                      {allClickable.map((c) => renderChip(c, key))}
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        {LEGEND.map(([label, color]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-[3px]", color)} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
