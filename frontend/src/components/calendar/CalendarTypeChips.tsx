import { ClipboardList, Flag, Repeat2, Star } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import type { CalendarFilters } from "@/components/calendar/types"

function Chip({
  active,
  colorOn,
  label,
  icon,
  onClick,
}: {
  active: boolean
  colorOn: string
  label: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-[26px] items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
        active
          ? cn(colorOn, "border-transparent")
          : "border text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  )
}

/** The four calendar type toggles (Milestones / Assignments / Events /
 *  Holidays), shared by the Month toolbar and the Schedule rail. */
export function CalendarTypeChips({
  filters,
  onChange,
  className,
}: {
  filters: CalendarFilters
  onChange: (f: CalendarFilters) => void
  className?: string
}) {
  const set = (patch: Partial<CalendarFilters>) =>
    onChange({ ...filters, ...patch })
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Chip
        active={filters.showMilestones}
        colorOn="bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
        icon={<Flag className="size-3.5" />}
        label="Milestones"
        onClick={() => set({ showMilestones: !filters.showMilestones })}
      />
      <Chip
        active={filters.showAssignments}
        colorOn="bg-amber-500/15 text-amber-700 dark:text-amber-300"
        icon={<ClipboardList className="size-3.5" />}
        label="Assignments"
        onClick={() => set({ showAssignments: !filters.showAssignments })}
      />
      <Chip
        active={filters.showEvents}
        colorOn="bg-violet-500/15 text-violet-700 dark:text-violet-300"
        icon={<Repeat2 className="size-3.5" />}
        label="Events"
        onClick={() => set({ showEvents: !filters.showEvents })}
      />
      <Chip
        active={filters.showHolidays}
        colorOn="bg-teal-500/15 text-teal-700 dark:text-teal-300"
        icon={<Star className="size-3.5" />}
        label="Holidays"
        onClick={() => set({ showHolidays: !filters.showHolidays })}
      />
    </div>
  )
}
