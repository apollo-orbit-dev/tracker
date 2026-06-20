import { ArrowRight } from "lucide-react"
import { Link } from "react-router"

import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AssignmentStatusBadge } from "@/components/AssignmentStatusBadge"
import { useAssignmentList } from "@/api/assignments"
import type { CalendarItem } from "@/api/calendar"
import { calendarItemAccent } from "@/lib/calendar-format"
import { cn } from "@/lib/utils"

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}

function MilestoneBody({ item }: { item: Extract<CalendarItem, { type: "milestone" }> }) {
  const list = useAssignmentList(item.project_id)
  const assignments = (list.data?.items ?? []).filter((a) => a.milestone_id === item.id)
  return (
    <div className="space-y-4 px-4">
      <div>
        <Row label="Direction">{item.direction}</Row>
        <Row label="Planned">{item.date}</Row>
        <Row label="Actual">{item.actual_date ?? "—"}</Row>
        <Row label="Completion">
          <span className={cn("inline-flex items-center gap-1", calendarItemAccent(item))}>
            <span className="size-2 rounded-full bg-current" />
            {item.completed ? "Done" : "In progress"}
          </span>
        </Row>
        <Row label="Project">{item.project_title}</Row>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-medium">Assignments ({assignments.length})</h4>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">None linked to this milestone.</p>
        ) : (
          <ul className="space-y-1">
            {assignments.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <AssignmentStatusBadge status={a.status} />
                <span className="flex-1 truncate">{a.description}</span>
                <span className="text-xs text-muted-foreground">{a.assignee_name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to={`/projects/${item.project_id}`}>
          Open project <ArrowRight className="size-3.5" />
        </Link>
      </Button>
    </div>
  )
}

function AssignmentBody({ item }: { item: Extract<CalendarItem, { type: "assignment" }> }) {
  return (
    <div className="space-y-4 px-4">
      <div>
        <Row label="Status"><AssignmentStatusBadge status={item.status} /></Row>
        <Row label="Assignee">{item.assignee_name}</Row>
        <Row label="Due">{item.date}</Row>
        <Row label="Milestone">{item.milestone_name ?? "—"}</Row>
        <Row label="Project">{item.project_title}</Row>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to={`/projects/${item.project_id}`}>
          Open project <ArrowRight className="size-3.5" />
        </Link>
      </Button>
    </div>
  )
}

export function CalendarItemDetailSheet({
  item, open, onOpenChange,
}: {
  item: CalendarItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isMilestone = item?.type === "milestone"
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader className="mb-4">
          <div className="mb-1">
            {isMilestone ? (
              <Badge className="bg-indigo-500/15 text-indigo-700">
                Milestone
              </Badge>
            ) : (
              <Badge className="bg-amber-500/15 text-amber-700">
                Assignment
              </Badge>
            )}
          </div>
          <SheetDescription className="sr-only">
            {item?.type === "milestone" ? "Milestone details" : "Assignment details"}
          </SheetDescription>
          <SheetTitle>
            {item ? (item.type === "milestone" ? item.name : item.description) : ""}
          </SheetTitle>
        </SheetHeader>
        {item?.type === "milestone" && <MilestoneBody item={item} />}
        {item?.type === "assignment" && <AssignmentBody item={item} />}
      </SheetContent>
    </Sheet>
  )
}
