import { format } from "date-fns"
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Rows3,
  SlidersHorizontal,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { CalendarTypeChips } from "@/components/calendar/CalendarTypeChips"
import { FilterChecklist } from "@/components/calendar/FilterChecklist"
import { Segmented } from "@/components/Segmented"
import { useMyDepartments } from "@/api/me"
import { useTaxonomyList } from "@/api/taxonomy"
import { useAuth } from "@/hooks/useAuth"
import { hasRole } from "@/lib/roles"
import type { CalendarFilters, CalendarView } from "@/components/calendar/types"

export type { CalendarFilters, CalendarView } from "@/components/calendar/types"

export function CalendarToolbar({
  month,
  onPrev,
  onNext,
  onToday,
  view,
  onView,
  filters,
  onFilters,
  onCreateEvent,
}: {
  month: Date
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  view: CalendarView
  onView: (v: CalendarView) => void
  filters: CalendarFilters
  onFilters: (f: CalendarFilters) => void
  onCreateEvent?: () => void
}) {
  const depts = useMyDepartments()
  const clients = useTaxonomyList("clients", false)
  const disciplines = useTaxonomyList("disciplines", false)
  const { data: user } = useAuth()
  const canCreateEvent = hasRole(user?.roles ?? [], "project_editor")
  const set = (patch: Partial<CalendarFilters>) =>
    onFilters({ ...filters, ...patch })
  const filterCount =
    filters.departmentIds.length +
    filters.clientIds.length +
    filters.disciplineIds.length

  const segmented = (
    <Segmented
      value={view}
      onChange={onView}
      aria-label="Calendar view"
      options={[
        { value: "month" as const, label: "Month", icon: <CalendarDays className="size-3.5" /> },
        { value: "schedule" as const, label: "Schedule", icon: <Rows3 className="size-3.5" /> },
      ]}
    />
  )
  const newEventBtn = canCreateEvent && onCreateEvent && (
    <Button size="sm" onClick={onCreateEvent}>
      <Plus className="size-3.5" />
      Event
    </Button>
  )

  // Schedule view: minimal toolbar — its filters + nav live in the rail.
  if (view === "schedule") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-semibold">Up next</h1>
        {segmented}
        {newEventBtn}
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-semibold">
          {format(month, "MMMM yyyy")}
        </h1>

        <Button variant="outline" size="sm" onClick={onToday}>
          Today
        </Button>
        <Button variant="outline" size="icon" className="size-8" aria-label="Previous month" onClick={onPrev}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="outline" size="icon" className="size-8" aria-label="Next month" onClick={onNext}>
          <ChevronRight className="size-4" />
        </Button>

        {segmented}

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <SlidersHorizontal className="size-3.5" />
              Filters
              {filterCount > 0 && (
                <span className="rounded-full bg-primary/15 px-1.5 text-[11px] font-semibold text-primary">
                  {filterCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 space-y-3 p-3">
            <FilterChecklist label="Departments" options={depts.data ?? []}
              selected={filters.departmentIds} onChange={(ids) => set({ departmentIds: ids })} />
            <FilterChecklist label="Clients" options={clients.data?.items ?? []}
              selected={filters.clientIds} onChange={(ids) => set({ clientIds: ids })} />
            <FilterChecklist label="Disciplines" options={disciplines.data?.items ?? []}
              selected={filters.disciplineIds} onChange={(ids) => set({ disciplineIds: ids })} />
          </PopoverContent>
        </Popover>

        {newEventBtn}
      </div>

      <CalendarTypeChips filters={filters} onChange={onFilters} />
    </div>
  )
}
