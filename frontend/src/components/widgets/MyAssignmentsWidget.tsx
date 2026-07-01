import { Link } from "react-router"

import { Badge, type BadgeTone } from "@/components/Badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { type MyAssignment, useMyAssignments } from "@/api/me"

// Relative-due pill (tone + label), mirroring the milestone-lookahead offset
// badge. The feed only carries still-open assignments, so overdue logic
// always applies.
function duePill(due: string | null): { tone: BadgeTone; label: string } {
  if (!due) return { tone: "slate", label: "No due date" }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dt = new Date(due.length === 10 ? `${due}T00:00:00` : due)
  const days = Math.round((dt.getTime() - today.getTime()) / 86_400_000)
  if (days < 0) return { tone: "rose", label: `${Math.abs(days)}d overdue` }
  if (days === 0) return { tone: "amber", label: "Today" }
  if (days <= 7) return { tone: "amber", label: `in ${days}d` }
  return { tone: "slate", label: `in ${days}d` }
}

function Row({ item }: { item: MyAssignment }) {
  const pill = duePill(item.due_date)
  return (
    <li className="flex items-start justify-between gap-3 border-b py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <Link
          to={`/projects/${item.project_id}`}
          className="block truncate text-sm font-medium hover:underline"
        >
          {item.description}
        </Link>
        <div className="truncate text-xs text-muted-foreground">
          {item.project_title}
          {item.milestone_name ? ` · ${item.milestone_name}` : ""}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Badge tone={pill.tone}>{pill.label}</Badge>
        {item.due_date && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {item.due_date.slice(0, 10)}
          </span>
        )}
      </div>
    </li>
  )
}

export function MyAssignmentsWidget({ title }: { title?: string | null } = {}) {
  const q = useMyAssignments()
  const rows = q.data?.items ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title || "My assignments"}</CardTitle>
        <CardDescription>
          Your open assignments across every project, soonest due first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : q.isError ? (
          <p className="text-sm text-red-700">{q.error.detail}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You're all caught up — no open assignments.
          </p>
        ) : (
          <ul className="max-h-72 overflow-y-auto">
            {rows.map((a) => (
              <Row key={a.id} item={a} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
