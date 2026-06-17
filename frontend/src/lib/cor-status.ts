// Mirror of backend `backend/app/db/models.py::COR_STATUSES`. Keep in sync.

export type CORStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "cancelled"

export const COR_STATUSES: CORStatus[] = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "cancelled",
]

export const COR_STATUS_META: Record<
  CORStatus,
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "bg-slate-200 text-slate-800" },
  submitted: { label: "Submitted", className: "bg-sky-500/15 text-sky-700" },
  approved: {
    label: "Approved",
    className: "bg-emerald-500/15 text-emerald-700",
  },
  rejected: { label: "Rejected", className: "bg-red-500/15 text-red-700" },
  cancelled: {
    label: "Cancelled",
    className: "bg-muted text-muted-foreground",
  },
}

export function corStatusLabel(s: string): string {
  return (COR_STATUS_META as Record<string, { label: string }>)[s]?.label ?? s
}
