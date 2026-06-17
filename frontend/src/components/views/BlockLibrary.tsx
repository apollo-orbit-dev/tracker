// Phase 7.3 — the add-block card shown at the end of the grid in edit
// mode. Sub-phase A offered Metric card + Text block; Phase 7.7 added
// Chart + Breakdown table; Phase 7.11 adds the Saved View table.
import { ChartColumn, Rows3, Sigma, Table2, Type } from "lucide-react"

import type { ViewBlock } from "@/api/views"
import { Card } from "@/components/ui/card"

const TYPES = [
  {
    id: "metric" as const,
    label: "Metric card",
    icon: Sigma,
    desc: "One number from the metric engine, with optional thresholds.",
  },
  {
    id: "chart" as const,
    label: "Chart",
    icon: ChartColumn,
    desc: "A metric grouped by a field — bar or donut.",
  },
  {
    id: "breakdown" as const,
    label: "Breakdown table",
    icon: Rows3,
    desc: "Mini pivot: group-by rows × metric columns.",
  },
  {
    id: "table" as const,
    label: "Saved View table",
    icon: Table2,
    desc: "Embedded project table; rows open the project.",
  },
  {
    id: "text" as const,
    label: "Text block",
    icon: Type,
    desc: "Notes — plain text for now, markdown formatting coming.",
  },
]

export function BlockLibrary({
  onAdd,
  firstBlock,
}: {
  onAdd: (t: ViewBlock["block_type"]) => void
  firstBlock: boolean
}) {
  return (
    <Card className="col-span-full gap-0 p-4 md:col-span-2">
      <p className="mb-2 text-sm font-medium">
        {firstBlock ? "Add your first block" : "Add block"}
      </p>
      {firstBlock && (
        <p className="mb-3 text-xs text-muted-foreground">
          Every block draws on the same metric engine — pick a shape:
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onAdd(t.id)}
            className="rounded-md border p-3 text-left hover:bg-muted"
          >
            <t.icon className="mb-1 size-4 text-muted-foreground" />
            <div className="text-sm font-medium">{t.label}</div>
            <div className="text-xs text-muted-foreground">{t.desc}</div>
          </button>
        ))}
      </div>
    </Card>
  )
}
