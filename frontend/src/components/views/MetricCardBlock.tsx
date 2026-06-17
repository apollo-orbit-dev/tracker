// Phase 7.4 — metric card renderer. Unconfigured blocks keep the
// "Configure" prompt; configured blocks fetch their value from the
// block data endpoint (server-evaluated — nothing is computed
// client-side) and render it with threshold tones and money/compact/%
// formatting via the shared formatValue (Phase 7.8). The wire value is
// a Decimal-serialized JSON string; Number() parses it for display.
// Clicking the value drills into the matching rows (DrillDownSheet,
// Phase 7.8).
import { Settings2, Sigma } from "lucide-react"

import {
  type MetricCardConfig,
  type ViewBlock,
  useBlockData,
} from "@/api/views"
import { formatValue } from "@/components/views/metricCatalog"
import { Button } from "@/components/ui/button"

function toneClass(value: number, cfg: MetricCardConfig): string {
  const t = cfg.thresholds
  if (!t) return "text-foreground"
  if (value <= t.green) return "text-emerald-600"
  if (value <= t.amber) return "text-amber-600"
  return "text-rose-600"
}

type Props = {
  viewId: string
  block: ViewBlock
  onConfigure: () => void
  /** Open the drill-down sheet for this card's metric (whole metric,
   *  no group). */
  onDrill: () => void
}

export function MetricCardBlock({
  viewId,
  block,
  onConfigure,
  onDrill,
}: Props) {
  const cfg = block.config as unknown as MetricCardConfig | null
  const q = useBlockData(viewId, block.id, !!cfg)

  if (!cfg) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <Sigma aria-hidden className="size-6 text-muted-foreground" />
        <p className="max-w-[260px] text-xs text-muted-foreground">
          One number from the metric engine. This block needs configuration
          before it shows data.
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
  // Narrow the 7.5 block-data union; a non-metric payload here would
  // mean a block_type/config mismatch — treat it as no data.
  const data = q.data
  if (!data || data.kind !== "metric" || data.value === null)
    return <p className="text-sm text-muted-foreground">—</p>

  const n = Number(data.value)
  return (
    <div>
      <button
        type="button"
        aria-label="Show matching rows"
        title="Show matching rows"
        onClick={onDrill}
        className={`-mx-1 block w-full rounded-md px-1 text-left text-3xl font-semibold tabular-nums hover:bg-muted ${toneClass(n, cfg)}`}
      >
        {formatValue(data.value, {
          money: cfg.money,
          compact: cfg.compact,
          pct: cfg.metric.aggregation === "pct_of_total",
        })}
      </button>
      {cfg.thresholds && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          ≤{cfg.thresholds.green} ok · ≤{cfg.thresholds.amber} watch
        </p>
      )}
    </div>
  )
}
