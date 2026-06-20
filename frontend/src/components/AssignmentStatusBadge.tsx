import { ASSIGNMENT_STATUS_META, assignmentStatusLabel } from "@/lib/assignment-status"
import { cn } from "@/lib/utils"

export function AssignmentStatusBadge({ status }: { status: string }) {
  const meta = (ASSIGNMENT_STATUS_META as Record<string, { className: string }>)[status]
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        meta?.className ?? "bg-slate-200 text-slate-800",
      )}
    >
      {assignmentStatusLabel(status)}
    </span>
  )
}
