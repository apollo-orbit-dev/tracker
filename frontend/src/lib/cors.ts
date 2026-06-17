// Phase 4.4.2 — display helpers for COR statuses. Mirrors lib/lifecycle.ts.
// Backend enum (from backend/app/db/models.py:COR_STATUSES):
//   draft, submitted, approved, rejected, cancelled.

import type { BadgeTone } from "@/components/Badge"

export type CorStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "cancelled"

const COR_STATUS_TONE: Record<CorStatus, BadgeTone> = {
  draft: "slate",
  submitted: "blue",
  approved: "emerald",
  rejected: "rose",
  // Cancelled CORs are uncommon and the design doesn't show one; slate
  // (same as draft) reads as "no impact" — rejected stays the warning.
  cancelled: "slate",
}

const COR_STATUS_LABEL: Record<CorStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
}

export function corStatusTone(status: string): BadgeTone {
  return (COR_STATUS_TONE as Record<string, BadgeTone>)[status] ?? "slate"
}

export function corStatusLabel(status: string): string {
  return (COR_STATUS_LABEL as Record<string, string>)[status] ?? status
}
