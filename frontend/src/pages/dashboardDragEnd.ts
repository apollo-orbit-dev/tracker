// Phase 2.11.2 — pure reducer for Dashboard drag-end handling.
//
// Extracted from Dashboard.tsx into its own module so the cross-column
// drag / empty-placeholder / full-width-barrier logic can be unit-tested
// without driving dnd-kit pointer events through jsdom (which is
// unreliable per the Phase 2.7 caveat).

import { arrayMove } from "@dnd-kit/sortable"

import type { DashboardWidget } from "@/api/dashboard_widgets"

/** Shape of a drag-end event we care about. Mirrors dnd-kit's
 * `DragEndEvent` but is structurally typed so tests can build one
 * without importing dnd-kit. */
export type DragEndLike = {
  active: { id: string | number }
  over: { id: string | number } | null
}

/** Re-shape widgets into the half-width "runs" between full-width
 * barriers. Used by the drop-onto-empty-placeholder branch to figure
 * out where in the global array to insert the dragged widget. */
function buildRuns(
  widgets: DashboardWidget[],
): { index: number; ids: string[] }[] {
  const sorted = [...widgets].sort((a, b) => a.order_index - b.order_index)
  const out: { index: number; ids: string[] }[] = []
  let cur: { ids: string[] } | null = null
  let idx = 0
  for (const w of sorted) {
    if (w.width === 2) {
      if (cur) {
        out.push({ index: idx++, ids: cur.ids })
        cur = null
      }
    } else {
      if (!cur) cur = { ids: [] }
      cur.ids.push(w.id)
    }
  }
  if (cur) out.push({ index: idx, ids: cur.ids })
  return out
}

function reindexed(rows: DashboardWidget[]): DashboardWidget[] {
  return rows.map((w, i) => ({ ...w, order_index: i }))
}

/** Apply a drag-end event to the widget array. Returns a new array with
 * the dragged widget moved (and, if relevant, its `column` updated).
 * Returns the input unchanged when the event is a no-op (no `over`,
 * dropped on itself, or refers to widgets not in the array). */
export function applyDragEnd(
  widgets: DashboardWidget[],
  event: DragEndLike,
): DashboardWidget[] {
  const { active, over } = event
  if (!over) return widgets
  const activeId = String(active.id)
  const overId = String(over.id)
  if (activeId === overId) return widgets

  const activeIdx = widgets.findIndex((w) => w.id === activeId)
  if (activeIdx < 0) return widgets

  const next = [...widgets]
  const dragged = { ...next[activeIdx] }

  // Empty-column drop: "empty-col-<runIdx>-<col>"
  const emptyMatch = /^empty-col-(\d+)-([01])$/.exec(overId)
  if (emptyMatch) {
    const runIdx = Number(emptyMatch[1])
    const newCol = Number(emptyMatch[2]) as 0 | 1
    dragged.column = newCol
    const runs = buildRuns(widgets)
    const run = runs[runIdx]
    const lastInRun = run
      ? next.find((w) => w.id === run.ids[run.ids.length - 1])
      : undefined
    const insertAfter = lastInRun
      ? next.findIndex((w) => w.id === lastInRun.id)
      : next.length - 1
    next.splice(activeIdx, 1)
    next.splice(insertAfter + (activeIdx < insertAfter ? 0 : 1), 0, dragged)
    return reindexed(next)
  }

  // Drop onto another widget.
  const overIdx = next.findIndex((w) => w.id === overId)
  if (overIdx < 0) return widgets
  const target = next[overIdx]
  if (target.width === 1) {
    dragged.column = (target.column ?? 0) as 0 | 1
  } // else: full-width target → keep the dragged widget's current column
  const moved = arrayMove(next, activeIdx, overIdx)
  const newPos = moved.findIndex((w) => w.id === activeId)
  moved[newPos] = dragged
  return reindexed(moved)
}
