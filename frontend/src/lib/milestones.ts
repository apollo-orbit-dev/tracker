// Phase 4.4.3 — display helpers for milestone date offsets. Mirrors
// lib/lifecycle.ts and lib/cors.ts. `days_offset` is the backend's
// signed integer where negative = past due, positive = upcoming.

import type { BadgeTone } from "@/components/Badge"

/**
 * Tone for the per-row offset badge on the milestone lookahead widget.
 *
 * - `< 0` (past due) → rose
 * - `=== 0` (today) → amber
 * - `1 ≤ n ≤ 7` (this week) → amber — useful "close to due" warning
 * - `> 7` → slate (background)
 */
export function milestoneOffsetTone(days_offset: number): BadgeTone {
  if (days_offset < 0) return "rose"
  if (days_offset <= 7) return "amber"
  return "slate"
}

/**
 * Compact label for the per-row offset badge.
 *
 * - `< 0` → `"{n}d overdue"`
 * - `=== 0` → `"Today"`
 * - `> 0` → `"in {n}d"`
 */
export function milestoneOffsetLabel(days_offset: number): string {
  if (days_offset < 0) return `${-days_offset}d overdue`
  if (days_offset === 0) return "Today"
  return `in ${days_offset}d`
}
