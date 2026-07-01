import { Checkbox } from "@/components/ui/checkbox"

/**
 * Phase 26.3 — a labeled, scrollable multi-select checkbox group. Used inside
 * the calendar toolbar's "Filters" popover (Month view) and the Schedule rail
 * (26.4). Deliberately *not* a nested popover — it renders inline so it can sit
 * inside another popover without the outside-click close hazard.
 */
export type FilterOption = { id: string; name: string }

export function FilterChecklist({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: FilterOption[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    )

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[hsl(var(--subtle-fg))]">
          {label}
        </span>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>
      <div className="max-h-40 space-y-0.5 overflow-y-auto">
        {options.length === 0 ? (
          <div className="px-1.5 py-1 text-xs text-muted-foreground">None available</div>
        ) : (
          options.map((o) => (
            <label
              key={o.id}
              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={selected.includes(o.id)}
                onCheckedChange={() => toggle(o.id)}
              />
              <span className="truncate">{o.name}</span>
            </label>
          ))
        )}
      </div>
    </div>
  )
}
