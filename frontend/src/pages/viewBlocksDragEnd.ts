// Phase 7.3 — pure reducer for ViewPage drag-end handling. Extracted
// (like dashboardDragEnd.ts) so reorder logic is unit-testable without
// driving dnd-kit pointer events through jsdom.
import { arrayMove } from "@dnd-kit/sortable"

import type { ViewBlock } from "@/api/views"

/** Shape of a drag-end event we care about. Mirrors dnd-kit's
 * `DragEndEvent` but is structurally typed so tests can build one
 * without importing dnd-kit. */
export type DragEndLike = {
  active: { id: string | number }
  over: { id: string | number } | null
}

/** Move the dragged block to the drop target's position and reindex
 * `order_index` 0..n-1. Returns the input array unchanged when the
 * event is a no-op (no `over`, dropped on itself, unknown ids). */
export function applyBlocksDragEnd(
  blocks: ViewBlock[],
  event: DragEndLike,
): ViewBlock[] {
  const { active, over } = event
  if (!over || active.id === over.id) return blocks
  const from = blocks.findIndex((b) => b.id === String(active.id))
  const to = blocks.findIndex((b) => b.id === String(over.id))
  if (from < 0 || to < 0) return blocks
  return arrayMove(blocks, from, to).map((b, i) => ({ ...b, order_index: i }))
}
