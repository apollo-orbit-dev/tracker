// Phase 7.10 — the Recharts-importing donut SVG, extracted from
// ChartBlock so recharts (~87 kB gzipped, open item 30) loads in its
// own chunk only when a donut is actually on screen (React.lazy +
// Suspense in ChartBlock; default export is what lazy() expects). The
// SVG is decorative/aria-hidden — the clickable legend stays in
// ChartBlock and renders immediately, so interaction never waits on
// this chunk.
import { Cell, Pie, PieChart } from "recharts"

import type { GroupRow } from "@/api/views"

export default function DonutChart({
  rows,
  palette,
}: {
  rows: GroupRow[]
  palette: string[]
}) {
  const pieData = rows.map((r, i) => ({
    name: r.label,
    value: Math.abs(Number(r.value ?? 0)),
    idx: i,
  }))
  return (
    /* accessibilityLayer={false}: Recharts 3 defaults it on, which
       makes this aria-hidden SVG keyboard-focusable (tabindex=0) —
       a verified axe violation. The button legend beside it is the
       accessible/interactive surface. */
    <PieChart
      width={140}
      height={140}
      aria-hidden
      accessibilityLayer={false}
      className="shrink-0"
    >
      <Pie
        data={pieData}
        dataKey="value"
        nameKey="name"
        innerRadius={36} /* ~55% of the outer radius */
        outerRadius={65}
        strokeWidth={0} /* no inter-segment stroke — the default white
                           border glares against the dark-mode card */
        isAnimationActive={false}
      >
        {pieData.map((d) => (
          <Cell key={d.idx} fill={palette[d.idx % palette.length]} />
        ))}
      </Pie>
    </PieChart>
  )
}
