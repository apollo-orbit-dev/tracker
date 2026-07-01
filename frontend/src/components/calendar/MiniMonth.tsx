import {
  addMonths,
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
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { CalendarHolidayItem, CalendarItem } from "@/api/calendar"
import type { CalendarEventItem } from "@/api/events"

const TONE_DOT: Record<string, string> = {
  milestone: "bg-indigo-500",
  assignment: "bg-amber-500",
  event: "bg-violet-500",
  holiday: "bg-teal-500",
}

/** Compact month with up-to-3 type dots per day — a density overview +
 *  navigator for the Schedule view. Clicking a day calls `onPickDate`. */
export function MiniMonth({
  month,
  onMonthChange,
  items,
  holidays,
  events,
  onPickDate,
}: {
  month: Date
  onMonthChange: (d: Date) => void
  items: CalendarItem[]
  holidays: CalendarHolidayItem[]
  events: CalendarEventItem[]
  onPickDate: (dateKey: string) => void
}) {
  const tones = new Map<string, Set<string>>()
  const add = (key: string, kind: string) => {
    const s = tones.get(key) ?? new Set<string>()
    s.add(kind)
    tones.set(key, s)
  }
  for (const i of items) add(i.date, i.type)
  for (const h of holidays) add(h.date, "holiday")
  for (const e of events) {
    for (const day of eachDayOfInterval({ start: parseISO(e.date), end: parseISO(e.end_date) })) {
      add(format(day, "yyyy-MM-dd"), "event")
    }
  }

  const gridStart = startOfWeek(startOfMonth(month))
  const gridEnd = endOfWeek(endOfMonth(month))
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  return (
    <div className="rounded-[14px] border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">{format(month, "MMMM yyyy")}</span>
        <div className="flex gap-0.5">
          <Button variant="ghost" size="icon" className="size-6" aria-label="Previous month"
            onClick={() => onMonthChange(addMonths(month, -1))}>
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-6" aria-label="Next month"
            onClick={() => onMonthChange(addMonths(month, 1))}>
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="pb-1 text-center text-[9.5px] font-semibold text-[hsl(var(--subtle-fg))]">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd")
          const dots = [...(tones.get(key) ?? [])].slice(0, 3)
          const today = isToday(day)
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPickDate(key)}
              className={cn(
                "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md text-[11px] hover:bg-muted",
                !isSameMonth(day, month) && "text-[hsl(var(--subtle-fg))]",
                today && "bg-primary font-bold text-primary-foreground hover:bg-primary",
              )}
            >
              <span>{format(day, "d")}</span>
              <span className="flex h-1 items-center gap-0.5">
                {dots.map((t, i) => (
                  <span key={i} className={cn("size-1 rounded-full", today ? "bg-primary-foreground" : TONE_DOT[t])} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
