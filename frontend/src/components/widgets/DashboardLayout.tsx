import { useDroppable } from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import type { ReactNode } from "react"

import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

/** Minimal shape a widget must have to participate in the layout. The
 * sandbox uses an inline mock that satisfies this; the real Dashboard
 * passes its DashboardWidget rows. */
export type LayoutWidget = {
  id: string
  width: number // 1 or 2
  column?: 0 | 1 // ignored when width === 2
  order_index: number
  title?: string | null
}

type Props<W extends LayoutWidget> = {
  widgets: W[]
  customizing: boolean
  renderWidget: (w: W) => ReactNode
}

type Block<W> =
  | { kind: "full"; widget: W }
  | { kind: "run"; index: number; left: W[]; right: W[] }

/** Split widgets into render blocks. Half-width widgets group into runs
 * bounded by full-width widgets (each full-width widget terminates the
 * current run and starts a fresh one). Within a run, widgets are sorted
 * by order_index and routed into left/right by `column` (default 0). */
function toBlocks<W extends LayoutWidget>(widgets: W[]): Block<W>[] {
  // Defensive copy + sort by order_index so the caller doesn't have to.
  const sorted = [...widgets].sort((a, b) => a.order_index - b.order_index)
  const blocks: Block<W>[] = []
  let runIdx = 0
  let current: { left: W[]; right: W[] } | null = null

  for (const w of sorted) {
    if (w.width === 2) {
      if (current) {
        blocks.push({ kind: "run", index: runIdx++, ...current })
        current = null
      }
      blocks.push({ kind: "full", widget: w })
    } else {
      if (!current) current = { left: [], right: [] }
      if ((w.column ?? 0) === 1) current.right.push(w)
      else current.left.push(w)
    }
  }
  if (current) blocks.push({ kind: "run", index: runIdx++, ...current })
  return blocks
}

function EmptyPlaceholder({
  id,
  label,
  visible,
}: {
  id: string
  label: string
  visible: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  // The useDroppable call above runs unconditionally — what changes by
  // `visible` is only the rendered JSX. Keeping the droppable registered
  // (even while the column is occupied) avoids dnd-kit's measureRects
  // loop ("Maximum update depth exceeded") that fires when a droppable
  // mounts mid-drag. When the column actually has widgets, we render a
  // zero-size invisible node so there's no "Drop here" text or layout
  // space taken — but dnd-kit still has the droppable in its registry.
  if (!visible) {
    return <div ref={setNodeRef} className="hidden" aria-hidden="true" />
  }
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-24 items-center justify-center rounded-md border-2 border-dashed text-sm text-muted-foreground",
        isOver ? "border-primary bg-primary/5 text-primary" : "",
      )}
    >
      {label}
    </div>
  )
}

export function DashboardLayout<W extends LayoutWidget>({
  widgets,
  customizing,
  renderWidget,
}: Props<W>) {
  const isMobile = useIsMobile()

  // Mobile: bypass the run/column structure entirely. Render widgets
  // in canonical order_index order in a single flat column.
  if (isMobile) {
    const sorted = [...widgets].sort((a, b) => a.order_index - b.order_index)
    return (
      <div className="flex flex-col gap-4">
        {sorted.map((w) => renderWidget(w))}
      </div>
    )
  }

  const blocks = toBlocks(widgets)

  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, blockIdx) => {
        if (block.kind === "full") {
          return (
            <div key={`full-${block.widget.id}`}>
              {renderWidget(block.widget)}
            </div>
          )
        }

        const leftEmpty = block.left.length === 0
        const rightEmpty = block.right.length === 0

        // Both columns always render at flex-1 (half-width) regardless of
        // whether the other side is empty. Auto-collapsing was visually
        // surprising: a user who explicitly placed widgets in column 0
        // saw them stretch to full width whenever column 1 happened to
        // be empty (especially right after a full-width widget reset
        // the column-pos run).

        return (
          <div
            key={`run-${block.index}-${blockIdx}`}
            className="flex flex-col gap-4 md:flex-row"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <SortableContext
                items={block.left.map((w) => w.id)}
                strategy={verticalListSortingStrategy}
              >
                {block.left.map((w) => renderWidget(w))}
                {customizing && (
                  <EmptyPlaceholder
                    id={`empty-col-${block.index}-0`}
                    label="Drop here"
                    visible={leftEmpty}
                  />
                )}
              </SortableContext>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <SortableContext
                items={block.right.map((w) => w.id)}
                strategy={verticalListSortingStrategy}
              >
                {block.right.map((w) => renderWidget(w))}
                {customizing && (
                  <EmptyPlaceholder
                    id={`empty-col-${block.index}-1`}
                    label="Drop here"
                    visible={rightEmpty}
                  />
                )}
              </SortableContext>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Re-exported so the sandbox / Dashboard can build droppable ids that
// match what the layout uses.
export function emptyColumnId(runIdx: number, column: 0 | 1): string {
  return `empty-col-${runIdx}-${column}`
}
