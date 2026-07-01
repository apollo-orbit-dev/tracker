import { ChevronDownIcon } from "lucide-react"

import {
  FilterChecklist,
  type FilterOption,
} from "@/components/calendar/FilterChecklist"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/**
 * Phase 27.3 — a single dropdown that multi-selects from `options`. The
 * trigger mirrors the shadcn Select trigger so it sits inline with the other
 * filters; the popover hosts the shared {@link FilterChecklist}. Empty
 * selection means "no filter" and shows `allLabel`.
 */
export function MultiSelectFilter({
  label,
  allLabel,
  options,
  selected,
  onChange,
  className,
}: {
  /** Accessible name + the checklist's heading (e.g. "Department filter"). */
  label: string
  /** Trigger text when nothing is selected (e.g. "All departments"). */
  allLabel: string
  options: FilterOption[]
  selected: string[]
  onChange: (ids: string[]) => void
  className?: string
}) {
  const triggerText =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? options.find((o) => o.id === selected[0])?.name ?? "1 selected"
        : `${selected.length} selected`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm whitespace-nowrap shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50",
            selected.length > 0 && "border-primary/50",
            className,
          )}
        >
          <span className="truncate">{triggerText}</span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[220px] p-2">
        <FilterChecklist
          label={label}
          options={options}
          selected={selected}
          onChange={onChange}
        />
      </PopoverContent>
    </Popover>
  )
}

export type { FilterOption }
