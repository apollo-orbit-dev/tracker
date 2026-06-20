import { format, parseISO } from "date-fns"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"
import { hasRole } from "@/lib/roles"
import type { CalendarEventItem } from "@/api/events"

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "EEEE, MMMM d, yyyy")
  } catch {
    return dateStr
  }
}

function formatTime(timeStr: string): string {
  // timeStr is HH:MM or HH:MM:SS
  try {
    const [h, m] = timeStr.split(":").map(Number)
    const d = new Date(2000, 0, 1, h, m)
    return format(d, "h:mm a")
  } catch {
    return timeStr
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  event: CalendarEventItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: () => void
  onDelete: () => void
  /** Disable the Edit button while the series data is still loading. */
  editDisabled?: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EventDetailSheet({
  event,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  editDisabled = false,
}: Props) {
  const { data: user } = useAuth()
  const canEdit = hasRole(user?.roles ?? [], "project_editor")

  let timeDisplay: string
  if (!event) {
    timeDisplay = ""
  } else if (event.all_day) {
    timeDisplay = "All day"
  } else if (event.start_time && event.end_time) {
    timeDisplay = `${formatTime(event.start_time)} – ${formatTime(event.end_time)}`
  } else if (event.start_time) {
    timeDisplay = formatTime(event.start_time)
  } else {
    timeDisplay = "All day"
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader className="mb-4">
          <div className="mb-1">
            <Badge className="bg-violet-500/15 text-violet-700 dark:text-violet-300">
              {event?.is_recurring ? "Recurring event" : "Event"}
            </Badge>
          </div>
          <SheetDescription className="sr-only">Event details</SheetDescription>
          <SheetTitle>{event?.title ?? ""}</SheetTitle>
        </SheetHeader>

        {event && (
          <div className="space-y-4 px-4">
            <div>
              {event.end_date && event.end_date !== event.date ? (
                <Row label="Dates">
                  {format(parseISO(event.date), "MMM d")} – {format(parseISO(event.end_date), "MMM d, yyyy")}
                </Row>
              ) : (
                <Row label="Date">{formatDate(event.date)}</Row>
              )}
              <Row label="Time">{timeDisplay}</Row>
              {event.about_user_name && (
                <Row label="About">{event.about_user_name}</Row>
              )}
              {event.is_recurring && (
                <Row label="Recurrence">Repeats</Row>
              )}
              {event.description && (
                <div className="pt-2 text-sm text-muted-foreground">
                  {event.description}
                </div>
              )}
            </div>

            {canEdit && (
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={onEdit} disabled={editDisabled}>
                  Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={onDelete}>
                  Delete
                </Button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
