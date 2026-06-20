// Mirror of backend `backend/app/db/models.py::ASSIGNMENT_STATUSES`. Keep in sync.

export type AssignmentStatus = "open" | "in_progress" | "done" | "cancelled"

export const ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  "open",
  "in_progress",
  "done",
  "cancelled",
]

export const ASSIGNMENT_STATUS_META: Record<
  AssignmentStatus,
  { label: string; className: string }
> = {
  open: { label: "Open", className: "bg-slate-200 text-slate-800" },
  in_progress: {
    label: "In progress",
    className: "bg-sky-500/15 text-sky-700",
  },
  done: { label: "Done", className: "bg-emerald-500/15 text-emerald-700" },
  cancelled: {
    label: "Cancelled",
    className: "bg-muted text-muted-foreground",
  },
}

export function assignmentStatusLabel(s: string): string {
  return (
    (ASSIGNMENT_STATUS_META as Record<string, { label: string }>)[s]?.label ?? s
  )
}
