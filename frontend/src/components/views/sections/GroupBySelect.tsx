// Phase 7.10 — group-by select shared between the chart and breakdown
// config sections (identical JSX to the pre-split sheet's
// groupBySelect closure). Lives in its own file (not shared.ts) so
// react-refresh sees a components-only module.
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { FieldOption } from "@/components/views/metricCatalog"

export function GroupBySelect({
  groupBy,
  groupByValid,
  groupOpts,
  onChange,
}: {
  groupBy: string
  groupByValid: boolean
  groupOpts: FieldOption[]
  onChange: (ref: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="block-cfg-groupby">Group by</Label>
      <Select
        value={groupByValid ? groupBy : ""}
        onValueChange={onChange}
        disabled={groupOpts.length === 0}
      >
        <SelectTrigger id="block-cfg-groupby">
          <SelectValue
            placeholder={
              groupOpts.length === 0
                ? "No groupable fields available"
                : "Select a field"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {groupOpts.map((o) => (
            <SelectItem key={o.ref} value={o.ref}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Select or yes/no fields only. Groups are capped at the top 12 by
        value, plus an "Other" row.
      </p>
    </div>
  )
}
