import { toast } from "sonner"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ApiError } from "@/api/auth"
import { type Assignment, useAssignmentUpdate } from "@/api/assignments"
import {
  ASSIGNMENT_STATUSES,
  assignmentStatusLabel,
} from "@/lib/assignment-status"

/**
 * Inline status dropdown for an assignment. Shown to editors and to the
 * assignee themselves (Phase 23.5) — both can flip status without opening
 * the full edit sheet. Sends a status-only PATCH; the backend authorizes
 * the assignee for status-only writes on their own assignment.
 */
export function AssignmentStatusControl({
  pid,
  assignment,
}: {
  pid: string
  assignment: Assignment
}) {
  const update = useAssignmentUpdate(pid)
  return (
    <Select
      value={assignment.status}
      onValueChange={(status) =>
        update.mutate(
          { id: assignment.id, body: { status } },
          {
            onError: (e) =>
              toast.error(e instanceof ApiError ? e.detail : "Update failed"),
          },
        )
      }
    >
      <SelectTrigger
        className="h-7 w-[130px] text-xs"
        aria-label={`Status for ${assignment.description}`}
        disabled={update.isPending}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ASSIGNMENT_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {assignmentStatusLabel(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
