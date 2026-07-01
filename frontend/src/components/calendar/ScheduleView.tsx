import {
  differenceInCalendarDays,
  format,
  parseISO,
  startOfMonth,
} from "date-fns"
import {
  ArrowDownLeft,
  ArrowUpRight,
  ClipboardList,
  Flag,
  Repeat2,
  Star,
} from "lucide-react"
import { useRef, useState } from "react"

import { AssignmentStatusBadge } from "@/components/AssignmentStatusBadge"
import { Avatar } from "@/components/Avatar"
import { FilterChecklist, type FilterOption } from "@/components/calendar/FilterChecklist"
import { CalendarTypeChips } from "@/components/calendar/CalendarTypeChips"
import { MiniMonth } from "@/components/calendar/MiniMonth"
import type { CalendarFilters } from "@/components/calendar/types"
import { cn } from "@/lib/utils"
import type { CalendarHolidayItem, CalendarItem } from "@/api/calendar"
import type { CalendarEventItem } from "@/api/events"

type Row =
  | { kind: "item"; date: string; item: CalendarItem }
  | { kind: "event"; date: string; event: CalendarEventItem }
  | { kind: "holiday"; date: string; holiday: CalendarHolidayItem }

const TILE: Record<string, string> = {
  milestone: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  assignment: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  event: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  holiday: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
}

const BUCKETS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "next", label: "Next week" },
  { key: "later", label: "Later" },
] as const

function bucketOf(date: string, today: Date): string {
  const d = differenceInCalendarDays(parseISO(date), today)
  if (d <= 0) return "today"
  if (d <= 6) return "week"
  if (d <= 13) return "next"
  return "later"
}

function timeLabel(t: string): string {
  const [h, m] = t.split(":").map(Number)
  const ap = h < 12 ? "am" : "pm"
  const hh = ((h + 11) % 12) + 1
  return `${hh}:${String(m).padStart(2, "0")} ${ap}`
}

function DirectionMeta({ direction }: { direction: string }) {
  const icon =
    direction === "inbound" ? (
      <ArrowDownLeft className="size-3" />
    ) : direction === "outbound" || direction === "external" ? (
      <ArrowUpRight className="size-3" />
    ) : null
  return (
    <span className="inline-flex items-center gap-1 text-xs capitalize text-muted-foreground">
      {icon}
      {direction}
    </span>
  )
}

export function ScheduleView({
  items,
  holidays,
  events,
  filters,
  onFilters,
  deptOptions,
  clientOptions,
  disciplineOptions,
  onSelect,
  onEventSelect,
}: {
  items: CalendarItem[]
  holidays: CalendarHolidayItem[]
  events: CalendarEventItem[]
  filters: CalendarFilters
  onFilters: (f: CalendarFilters) => void
  deptOptions: FilterOption[]
  clientOptions: FilterOption[]
  disciplineOptions: FilterOption[]
  onSelect: (i: CalendarItem) => void
  onEventSelect: (e: CalendarEventItem) => void
}) {
  const today = new Date()
  const todayKey = format(today, "yyyy-MM-dd")
  const [miniMonth, setMiniMonth] = useState(() => startOfMonth(today))
  const agendaRef = useRef<HTMLDivElement>(null)

  const rows: Row[] = [
    ...items.map((item) => ({ kind: "item" as const, date: item.date, item })),
    ...events.map((event) => ({ kind: "event" as const, date: event.date, event })),
    ...holidays.map((holiday) => ({ kind: "holiday" as const, date: holiday.date, holiday })),
  ]
    .filter((r) => r.date >= todayKey)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const grouped: Record<string, Row[]> = { today: [], week: [], next: [], later: [] }
  for (const r of rows) grouped[bucketOf(r.date, today)].push(r)

  const set = (patch: Partial<CalendarFilters>) => onFilters({ ...filters, ...patch })

  function handlePick(key: string) {
    const el = agendaRef.current
    if (!el) return
    const exact = el.querySelector<HTMLElement>(`[data-date="${key}"]`)
    if (exact) {
      exact.scrollIntoView({ behavior: "smooth", block: "start" })
      return
    }
    for (const row of el.querySelectorAll<HTMLElement>("[data-date]")) {
      if ((row.dataset.date ?? "") >= key) {
        row.scrollIntoView({ behavior: "smooth", block: "start" })
        return
      }
    }
  }

  function renderRow(r: Row) {
    const date = parseISO(r.date)
    const dateChip = (
      <div className="w-9 shrink-0 text-center">
        <div className="text-base font-semibold leading-none">{format(date, "d")}</div>
        <div className="text-[10px] uppercase tracking-[0.03em] text-[hsl(var(--subtle-fg))]">
          {format(date, "MMM")}
        </div>
      </div>
    )
    if (r.kind === "holiday") {
      return (
        <div key={`h:${r.holiday.date}:${r.holiday.country}`} data-date={r.date}
          className="flex items-center gap-3 border-b px-3.5 py-2.5 last:border-b-0">
          {dateChip}
          <div className={cn("grid size-7 place-items-center rounded-lg", TILE.holiday)}>
            <Star className="size-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{r.holiday.name}</div>
            <div className="text-xs text-muted-foreground">US holiday</div>
          </div>
          <span className="rounded-full bg-teal-500/15 px-2.5 py-0.5 text-[11px] font-medium text-teal-700 dark:text-teal-300">
            Holiday
          </span>
        </div>
      )
    }
    if (r.kind === "event") {
      const e = r.event
      const multi = e.end_date && e.end_date !== e.date
      const sub = multi
        ? `${format(parseISO(e.date), "MMM d")} – ${format(parseISO(e.end_date), "MMM d")}`
        : "Department event"
      return (
        <button key={`e:${e.event_id}:${e.date}`} type="button" data-date={r.date}
          onClick={() => onEventSelect(e)}
          className="flex w-full items-center gap-3 border-b px-3.5 py-2.5 text-left last:border-b-0 hover:bg-[hsl(var(--row-hover))]">
          {dateChip}
          <div className={cn("grid size-7 place-items-center rounded-lg", TILE.event)}>
            <Repeat2 className="size-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{e.title}</div>
            <div className="truncate text-xs text-muted-foreground">{sub}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            {e.is_recurring && (
              <span className="inline-flex items-center gap-1"><Repeat2 className="size-3" />Repeats</span>
            )}
            <span>{e.all_day || !e.start_time ? "All day" : timeLabel(e.start_time)}</span>
          </div>
        </button>
      )
    }
    // item — milestone or assignment
    const it = r.item
    const Icon = it.type === "milestone" ? Flag : ClipboardList
    const title = it.type === "milestone" ? it.name : it.description
    return (
      <button key={`${it.type}:${it.id}`} type="button" data-date={r.date}
        onClick={() => onSelect(it)}
        className="flex w-full items-center gap-3 border-b px-3.5 py-2.5 text-left last:border-b-0 hover:bg-[hsl(var(--row-hover))]">
        {dateChip}
        <div className={cn("grid size-7 place-items-center rounded-lg", TILE[it.type])}>
          <Icon className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("truncate text-sm font-medium", it.type === "milestone" && it.completed && "text-muted-foreground line-through")}>
            {title}
          </div>
          <div className="truncate text-xs text-muted-foreground">{it.project_title}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {it.type === "milestone" ? (
            <DirectionMeta direction={it.direction} />
          ) : (
            <>
              <Avatar name={it.assignee_name} size={22} />
              <AssignmentStatusBadge status={it.status} />
            </>
          )}
        </div>
      </button>
    )
  }

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[280px_1fr]">
      <div className="flex flex-col gap-4 lg:sticky lg:top-0">
        <MiniMonth
          month={miniMonth}
          onMonthChange={setMiniMonth}
          items={items}
          holidays={holidays}
          events={events}
          onPickDate={handlePick}
        />
        <div className="space-y-3 rounded-[14px] border bg-card p-3">
          <FilterChecklist label="Departments" options={deptOptions}
            selected={filters.departmentIds} onChange={(ids) => set({ departmentIds: ids })} />
          <FilterChecklist label="Clients" options={clientOptions}
            selected={filters.clientIds} onChange={(ids) => set({ clientIds: ids })} />
          <FilterChecklist label="Disciplines" options={disciplineOptions}
            selected={filters.disciplineIds} onChange={(ids) => set({ disciplineIds: ids })} />
          <div className="border-t pt-3">
            <CalendarTypeChips filters={filters} onChange={onFilters} />
          </div>
        </div>
      </div>

      <div ref={agendaRef} className="space-y-5">
        {rows.length === 0 ? (
          <div className="rounded-[14px] border bg-card p-10 text-center text-sm text-muted-foreground">
            Nothing scheduled.
          </div>
        ) : (
          BUCKETS.map((b) =>
            grouped[b.key].length === 0 ? null : (
              <div key={b.key}>
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="text-xs font-bold uppercase tracking-[0.02em] text-[hsl(var(--subtle-fg))]">
                    {b.label}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {grouped[b.key].length}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <div className="overflow-hidden rounded-[14px] border bg-card">
                  {grouped[b.key].map(renderRow)}
                </div>
              </div>
            ),
          )
        )}
      </div>
    </div>
  )
}
