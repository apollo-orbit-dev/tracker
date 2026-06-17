// Phase 7.8 — drill-down results panel. Opens when a configured metric
// card or a chart group row is clicked, posts the block's
// server-validated metric (plus an optional group bucket) to
// POST /api/metrics/eval/rows, and lists the matching entity rows —
// each linking to its project and closing the sheet on click.
//
// Request contract (backend DrillRequest, Phase 7.6/7.6.1): group
// params are sent only when a group was clicked; `group_value: null`
// with `group_by` set means the "—" (unset) bucket — callers derive it
// from the 7.5.1 is_null flag, never from label text. Boolean group
// labels are exactly "True"/"False" and pass through as-is. The server
// re-validates everything and caps rows at 100 with a `total` count.
import { useEffect } from "react"
import { Link } from "react-router"

import { type MetricDefinition, useMetricRows } from "@/api/views"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

/** What to drill: a metric, optionally narrowed to one group bucket.
 *  groupValue null = the "—" (unset) bucket; only valid with groupBy. */
export type DrillTarget = {
  metric: MetricDefinition
  groupBy?: string
  groupValue?: string | null
  title: string
}

type Props = {
  open: DrillTarget | null
  onClose: () => void
}

export function DrillDownSheet({ open, onClose }: Props) {
  const rowsMut = useMetricRows()
  const { mutate, reset } = rowsMut

  useEffect(() => {
    if (!open) {
      reset()
      return
    }
    const body: Parameters<typeof mutate>[0] = { metric: open.metric }
    if (open.groupBy) {
      body.group_by = open.groupBy
      body.group_value = open.groupValue ?? null
    }
    mutate(body)
  }, [open, mutate, reset])

  const data = rowsMut.data

  return (
    <Sheet open={open !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{open?.title ?? ""}</SheetTitle>
          <SheetDescription>
            The rows behind this number. Click one to open its project.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-0.5 px-4 pb-4">
          {rowsMut.isPending && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {rowsMut.isError && (
            <p className="text-sm text-red-700">{rowsMut.error.detail}</p>
          )}
          {data && data.rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No matching rows.</p>
          )}
          {data?.rows.map((r) => (
            <Link
              key={r.id}
              to={`/projects/${r.project_id}`}
              onClick={onClose}
              className="block rounded-md px-2 py-1.5 hover:bg-muted"
            >
              <span className="block truncate text-sm font-medium">
                {r.label}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {r.sublabel}
              </span>
            </Link>
          ))}
          {data && data.rows.length < data.total && (
            <p className="pt-2 text-xs text-muted-foreground">
              Showing {data.rows.length} of {data.total}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
