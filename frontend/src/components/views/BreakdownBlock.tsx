// Phase 7.7 — breakdown block renderer: a mini pivot (group-by rows ×
// 1–4 metric columns) in a shadcn Table. All numbers are
// server-evaluated by the block data endpoint (evaluate_grouped per
// column, joined server-side on one ranked label set) — nothing is
// aggregated client-side. Decimal cells arrive as JSON strings;
// per-column money formatting comes from data.money[i]. The shared
// synthetic "Other" tail row is flagged by is_other (7.5.1) and
// rendered muted — never detected by label text. Renders flush
// (BlockShell noPad) so the table rules span the card.
import { Rows3, Settings2 } from "lucide-react"

import {
  type BreakdownBlockConfig,
  type ViewBlock,
  useBlockData,
} from "@/api/views"
import { formatValue } from "@/components/views/metricCatalog"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type Props = {
  viewId: string
  block: ViewBlock
  onConfigure: () => void
}

export function BreakdownBlock({ viewId, block, onConfigure }: Props) {
  const cfg = block.config as unknown as BreakdownBlockConfig | null
  const q = useBlockData(viewId, block.id, !!cfg)

  if (!cfg) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <Rows3 aria-hidden className="size-6 text-muted-foreground" />
        <p className="max-w-[260px] text-xs text-muted-foreground">
          A mini pivot: group-by rows × metric columns. This block needs
          configuration before it shows data.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onConfigure}>
          <Settings2 className="mr-1 size-3.5" /> Configure
        </Button>
      </div>
    )
  }
  if (q.isLoading)
    return <p className="px-4 text-sm text-muted-foreground">Loading…</p>
  if (q.isError)
    return <p className="px-4 text-sm text-red-700">{q.error.detail}</p>
  const data = q.data
  if (!data || data.kind !== "breakdown" || data.rows.length === 0)
    return <p className="px-4 text-sm text-muted-foreground">No data.</p>

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4">
            <span className="sr-only">Group</span>
          </TableHead>
          {data.columns.map((label, i) => (
            <TableHead
              key={i}
              className={`text-right ${
                i === data.columns.length - 1 ? "pr-4" : ""
              }`}
            >
              {label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.rows.map((r, ri) => (
          <TableRow
            key={ri}
            className={r.is_other ? "text-muted-foreground" : undefined}
          >
            <TableCell className="pl-4 font-medium">{r.label}</TableCell>
            {r.cells.map((cell, ci) => (
              <TableCell
                key={ci}
                className={`text-right tabular-nums ${
                  ci === r.cells.length - 1 ? "pr-4" : ""
                }`}
              >
                {formatValue(cell, { money: data.money[ci] ?? false })}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
