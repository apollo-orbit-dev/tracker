// Phase 7.7 — chart block renderer. Bar charts are an accessible
// labeled bar list (one <button> per group: label / CSS-width track /
// value) — the mock's BarRows visual language, testable in jsdom and
// doubling as the drill-down click targets. Donuts render through
// Recharts (PieChart/Pie/Cell, lazy-loaded via DonutChart.tsx since
// Phase 7.10 so recharts stays out of the main chunk — open item 30)
// with a custom side legend of buttons so segments stay clickable and
// accessible; the legend renders in the main chunk, only the
// aria-hidden SVG waits on the lazy import. Nothing is aggregated
// client-side — rows come server-evaluated from the block data
// endpoint; Decimal values arrive as JSON strings and Number() parses
// them for display/track math only.
//
// Synthetic buckets: rows are keyed/disabled off the is_other /
// is_null flags (Phase 7.5.1), never off label text. "Other" is not
// drillable; the "—" (unset) bucket IS — onDrill carries isNull so
// Phase 7.8 can send group_value: null without label matching.
import { Suspense, lazy } from "react"
import { ChartColumn, Settings2 } from "lucide-react"

import {
  type ChartBlockConfig,
  type GroupRow,
  type ViewBlock,
  useBlockData,
} from "@/api/views"
import { LazyBoundary } from "@/components/views/LazyBoundary"
import { formatValue } from "@/components/views/metricCatalog"
import { Button } from "@/components/ui/button"

const DonutChart = lazy(() => import("./DonutChart"))

/** A clicked group: label is display text; isNull marks the "—" bucket
 *  (drilled as group_value: null). null = the whole metric. */
export type DrillGroup = { label: string; isNull: boolean }

// 6-tone donut palette (the block accent hues at their 500 stops),
// rotated across segments.
const PALETTE = [
  "#6366f1", // indigo
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#f43f5e", // rose
  "#64748b", // slate
]

// Static strings so Tailwind sees every class at build time (same
// pattern as BlockShell's ACCENT_DOT).
const ACCENT_BAR: Record<ViewBlock["accent"], string> = {
  indigo: "bg-indigo-500",
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  slate: "bg-slate-500",
}

function magnitude(r: GroupRow): number {
  return Math.abs(Number(r.value ?? 0))
}

type Props = {
  viewId: string
  block: ViewBlock
  onConfigure: () => void
  onDrill: (group: DrillGroup | null) => void
}

export function ChartBlock({ viewId, block, onConfigure, onDrill }: Props) {
  const cfg = block.config as unknown as ChartBlockConfig | null
  const q = useBlockData(viewId, block.id, !!cfg)

  if (!cfg) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <ChartColumn aria-hidden className="size-6 text-muted-foreground" />
        <p className="max-w-[260px] text-xs text-muted-foreground">
          A metric grouped by a field, as a bar or donut chart. This block
          needs configuration before it shows data.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onConfigure}>
          <Settings2 className="mr-1 size-3.5" /> Configure
        </Button>
      </div>
    )
  }
  if (q.isLoading)
    return <p className="text-sm text-muted-foreground">Loading…</p>
  if (q.isError) return <p className="text-sm text-red-700">{q.error.detail}</p>
  const data = q.data
  if (!data || data.kind !== "chart" || data.rows.length === 0)
    return <p className="text-sm text-muted-foreground">No data.</p>

  return data.chart_kind === "bar" ? (
    <BarRows
      rows={data.rows}
      money={data.money}
      accent={block.accent}
      onDrill={onDrill}
    />
  ) : (
    <Donut rows={data.rows} money={data.money} onDrill={onDrill} />
  )
}

function BarRows({
  rows,
  money,
  accent,
  onDrill,
}: {
  rows: GroupRow[]
  money: boolean
  accent: ViewBlock["accent"]
  onDrill: (group: DrillGroup) => void
}) {
  const max = Math.max(...rows.map(magnitude), 1)
  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <button
          key={i}
          type="button"
          disabled={r.is_other}
          title={
            r.is_other
              ? "The Other bucket groups the remaining values and can't be drilled"
              : `${r.label} — ${formatValue(r.value, { money })}`
          }
          onClick={() => onDrill({ label: r.label, isNull: r.is_null })}
          className="grid w-full grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-2 rounded-md px-1 py-1 text-left text-xs hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
        >
          <span className="truncate text-muted-foreground">{r.label}</span>
          <span aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
            <span
              className={`block h-full rounded-full ${
                r.is_other ? "bg-muted-foreground/40" : ACCENT_BAR[accent]
              }`}
              style={{ width: `${Math.max(2, (magnitude(r) / max) * 100)}%` }}
            />
          </span>
          <span className="font-medium tabular-nums">
            {formatValue(r.value, { money })}
          </span>
        </button>
      ))}
    </div>
  )
}

function Donut({
  rows,
  money,
  onDrill,
}: {
  rows: GroupRow[]
  money: boolean
  onDrill: (group: DrillGroup) => void
}) {
  return (
    <div className="flex items-center gap-4">
      <LazyBoundary
        fallback={
          <p className="text-sm text-muted-foreground">
            Chart failed to load — reload the page.
          </p>
        }
      >
        <Suspense
          fallback={
            <p className="text-sm text-muted-foreground">Loading chart…</p>
          }
        >
          <DonutChart rows={rows} palette={PALETTE} />
        </Suspense>
      </LazyBoundary>
      <div className="min-w-0 flex-1 space-y-0.5">
        {rows.map((r, i) => (
          <button
            key={i}
            type="button"
            disabled={r.is_other}
            title={
              r.is_other
                ? "The Other bucket groups the remaining values and can't be drilled"
                : undefined
            }
            onClick={() => onDrill({ label: r.label, isNull: r.is_null })}
            className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: PALETTE[i % PALETTE.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {r.label}
            </span>
            <span className="font-medium tabular-nums">
              {formatValue(r.value, { money })}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
