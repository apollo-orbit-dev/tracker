import { format } from "date-fns"
import { CalendarDays, Check, Plus, Rows3 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Segmented } from "@/components/Segmented"
import { cn } from "@/lib/utils"
import { useMyDepartments } from "@/api/me"
import { useTaxonomyList } from "@/api/taxonomy"
import { useAuth } from "@/hooks/useAuth"
import { hasRole } from "@/lib/roles"

const NONE = "__all__"

export type CalendarFilters = {
  department_id: string | null
  client_id: string | null
  discipline_id: string | null
  showMilestones: boolean
  showAssignments: boolean
  showHolidays: boolean
  showEvents: boolean
}

type TypeToggleChipProps = {
  active: boolean
  colorOn: string
  label: string
  onClick: () => void
}

function TypeToggleChip({ active, colorOn, label, onClick }: TypeToggleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-[26px] items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors",
        active
          ? cn(colorOn, "border-transparent")
          : "border text-muted-foreground hover:text-foreground",
      )}
    >
      {active && <Check className="size-3.5" />}
      {label}
    </button>
  )
}

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
  view: "month" | "agenda"
  onView: (v: "month" | "agenda") => void
  filters: CalendarFilters
  onFilters: (f: CalendarFilters) => void
  onCreateEvent?: () => void
}) {
  // useMyDepartments returns DepartmentBrief[] directly (not { items: [] })
  const depts = useMyDepartments()
  const clients = useTaxonomyList("clients", false)
  const disciplines = useTaxonomyList("disciplines", false)
  const { data: user } = useAuth()
  const canCreateEvent = hasRole(user?.roles ?? [], "project_editor")
  const set = (patch: Partial<CalendarFilters>) =>
    onFilters({ ...filters, ...patch })

  return (
    <div className="flex flex-wrap items-center gap-2">
      <h1 className="mr-auto text-lg font-semibold">
        {format(month, "MMMM yyyy")}
      </h1>

      <Button variant="outline" size="sm" onClick={onToday}>
        Today
      </Button>
      <Button variant="outline" size="sm" onClick={onPrev}>
        ‹
      </Button>
      <Button variant="outline" size="sm" onClick={onNext}>
        ›
      </Button>

      <Segmented
        value={view}
        onChange={onView}
        aria-label="Calendar view"
        options={[
          { value: "month" as const, label: "Month", icon: <CalendarDays className="size-3.5" /> },
          { value: "agenda" as const, label: "Agenda", icon: <Rows3 className="size-3.5" /> },
        ]}
      />

      <Select
        value={filters.department_id ?? NONE}
        onValueChange={(v) =>
          set({ department_id: v === NONE ? null : v })
        }
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="All departments" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>All departments</SelectItem>
          {(depts.data ?? []).map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.client_id ?? NONE}
        onValueChange={(v) => set({ client_id: v === NONE ? null : v })}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="All clients" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>All clients</SelectItem>
          {(clients.data?.items ?? []).map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.discipline_id ?? NONE}
        onValueChange={(v) =>
          set({ discipline_id: v === NONE ? null : v })
        }
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="All disciplines" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>All disciplines</SelectItem>
          {(disciplines.data?.items ?? []).map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <TypeToggleChip
        active={filters.showMilestones}
        colorOn="bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
        label="Milestones"
        onClick={() => set({ showMilestones: !filters.showMilestones })}
      />
      <TypeToggleChip
        active={filters.showAssignments}
        colorOn="bg-amber-500/15 text-amber-700 dark:text-amber-300"
        label="Assignments"
        onClick={() => set({ showAssignments: !filters.showAssignments })}
      />
      <TypeToggleChip
        active={filters.showHolidays}
        colorOn="bg-teal-500/15 text-teal-700 dark:text-teal-300"
        label="Holidays"
        onClick={() => set({ showHolidays: !filters.showHolidays })}
      />
      <TypeToggleChip
        active={filters.showEvents}
        colorOn="bg-violet-500/15 text-violet-700 dark:text-violet-300"
        label="Events"
        onClick={() => set({ showEvents: !filters.showEvents })}
      />
      {canCreateEvent && onCreateEvent && (
        <Button size="sm" onClick={onCreateEvent}>
          <Plus className="size-3.5" />
          Event
        </Button>
      )}
    </div>
  )
}
