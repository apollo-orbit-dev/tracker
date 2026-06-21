import { addMonths, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns"
import { useMemo, useState } from "react"

import { useTopbarCrumbs } from "@/hooks/useTopbarCrumbs"
import { AgendaList } from "@/components/calendar/AgendaList"
import { CalendarItemDetailSheet } from "@/components/calendar/CalendarItemDetailSheet"
import { CalendarToolbar, type CalendarFilters } from "@/components/calendar/CalendarToolbar"
import { EventDetailSheet } from "@/components/calendar/EventDetailSheet"
import { EventScopeDialog } from "@/components/calendar/EventScopeDialog"
import { EventSheet } from "@/components/calendar/EventSheet"
import { MonthGrid } from "@/components/calendar/MonthGrid"
import { useCalendarHolidays, useCalendarItems, type CalendarItem } from "@/api/calendar"
import {
  useCalendarEvents,
  useEvent,
  useEventDelete,
  useOccurrenceCancel,
  type CalendarEventItem,
} from "@/api/events"
import { useMyDepartments } from "@/api/me"
import { useAuth } from "@/hooks/useAuth"
import { hasRole } from "@/lib/roles"

export function CalendarPage() {
  useTopbarCrumbs(useMemo(() => [{ label: "Calendar" }], []))
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [view, setView] = useState<"month" | "agenda">("month")
  const [selected, setSelected] = useState<CalendarItem | null>(null)

  // ── Event detail state ────────────────────────────────────────────────────
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventItem | null>(null)
  // scopeAction: "edit" or "delete" when scope dialog is open; null otherwise
  const [scopeAction, setScopeAction] = useState<"edit" | "delete" | null>(null)
  // editOccurrenceOnly: true when user chose "This occurrence" in the edit scope dialog
  const [editOccurrenceOnly, setEditOccurrenceOnly] = useState(false)
  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [createEventOpen, setCreateEventOpen] = useState(false)
  const [createStartDate, setCreateStartDate] = useState<string | undefined>(undefined)

  // ── Filters ───────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<CalendarFilters>({
    department_id: null,
    client_id: null,
    discipline_id: null,
    showMilestones: true,
    showAssignments: true,
    showHolidays: true,
    showEvents: true,
  })

  const start = format(startOfWeek(startOfMonth(month)), "yyyy-MM-dd")
  const end = format(endOfWeek(endOfMonth(month)), "yyyy-MM-dd")

  const depts = useMyDepartments()
  const defaultDeptId = (depts.data ?? [])[0]?.id ?? ""

  // Only project_editor+ can create events — matches the toolbar's New-event
  // button. Viewers shouldn't be able to open the create flyout by clicking a
  // day (the backend rejects the write, but the UI shouldn't offer it).
  const { data: user } = useAuth()
  const canCreateEvent = hasRole(user?.roles ?? [], "project_editor")

  // ── Calendar data ─────────────────────────────────────────────────────────
  const types = [
    ...(filters.showMilestones ? (["milestone"] as const) : []),
    ...(filters.showAssignments ? (["assignment"] as const) : []),
  ]
  const query = useCalendarItems(
    types.length
      ? {
          start,
          end,
          department_id: filters.department_id,
          client_id: filters.client_id,
          discipline_id: filters.discipline_id,
          types,
        }
      : null,
  )
  const items = (query.data?.items ?? []).filter((i) =>
    i.type === "milestone" ? filters.showMilestones : filters.showAssignments,
  )

  const holidaysQuery = useCalendarHolidays(filters.showHolidays ? { start, end } : null)
  const holidays = filters.showHolidays ? (holidaysQuery.data?.items ?? []) : []

  const eventsQuery = useCalendarEvents(
    filters.showEvents
      ? { start, end, department_id: filters.department_id }
      : null,
  )
  const events = filters.showEvents ? (eventsQuery.data?.items ?? []) : []

  // ── Fetch full series whenever an event is selected (needed for edit) ──────
  // CalendarEventItem only carries display fields; EventSeries has department_id + recurrence.
  // Fetch for ALL selected events (not just recurring) so the edit EventSheet always
  // receives the real seriesItem rather than opening with item=null.
  const seriesQuery = useEvent(selectedEvent?.event_id ?? null)
  const seriesItem = seriesQuery.data ?? null

  // ── Mutation hooks ────────────────────────────────────────────────────────
  const eventDelete = useEventDelete()
  const occurrenceCancel = useOccurrenceCancel(selectedEvent?.event_id ?? "")

  // ── Event handlers ────────────────────────────────────────────────────────

  function handleDetailClose(o: boolean) {
    if (!o) setSelectedEvent(null)
  }

  function handleEditClick() {
    if (!selectedEvent) return
    if (selectedEvent.is_recurring) {
      setScopeAction("edit")
    } else {
      // Non-recurring: straight to EventSheet series-edit (no scope choice needed)
      setEditOccurrenceOnly(false)
      setEditSheetOpen(true)
    }
  }

  function handleDeleteClick() {
    if (!selectedEvent) return
    if (selectedEvent.is_recurring) {
      setScopeAction("delete")
    } else {
      // Non-recurring: delete immediately
      eventDelete.mutate(selectedEvent.event_id, {
        onSuccess: () => setSelectedEvent(null),
      })
    }
  }

  function handleScopeThisOccurrence() {
    if (!selectedEvent) return
    const action = scopeAction
    setScopeAction(null)
    if (action === "edit") {
      setEditOccurrenceOnly(true)
      setEditSheetOpen(true)
    } else {
      // delete this occurrence only
      occurrenceCancel.mutate(selectedEvent.original_date, {
        onSuccess: () => setSelectedEvent(null),
      })
    }
  }

  function handleScopeEntireSeries() {
    if (!selectedEvent) return
    const action = scopeAction
    setScopeAction(null)
    if (action === "edit") {
      setEditOccurrenceOnly(false)
      setEditSheetOpen(true)
    } else {
      // delete entire series
      eventDelete.mutate(selectedEvent.event_id, {
        onSuccess: () => setSelectedEvent(null),
      })
    }
  }

  function handleEditSheetClose(o: boolean) {
    setEditSheetOpen(o)
    if (!o) {
      setEditOccurrenceOnly(false)
    }
  }

  return (
    <main className="space-y-4 px-6 py-7">
      <CalendarToolbar
        month={month}
        onPrev={() => setMonth((m) => addMonths(m, -1))}
        onNext={() => setMonth((m) => addMonths(m, 1))}
        onToday={() => setMonth(startOfMonth(new Date()))}
        view={view}
        onView={setView}
        filters={filters}
        onFilters={setFilters}
        onCreateEvent={() => { setCreateStartDate(undefined); setCreateEventOpen(true) }}
      />
      {view === "month" ? (
        <MonthGrid
          month={month}
          items={items}
          holidays={holidays}
          events={events}
          onSelect={setSelected}
          onEventSelect={(ev) => setSelectedEvent(ev)}
          onDayClick={
            canCreateEvent
              ? (date) => { setCreateStartDate(date); setCreateEventOpen(true) }
              : undefined
          }
        />
      ) : (
        <AgendaList
          items={items}
          holidays={holidays}
          events={events}
          onSelect={setSelected}
          onEventSelect={(ev) => setSelectedEvent(ev)}
        />
      )}

      {/* Milestone / assignment detail sheet */}
      <CalendarItemDetailSheet
        item={selected}
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
      />

      {/* Event detail sheet (read-only summary with Edit/Delete) */}
      <EventDetailSheet
        event={selectedEvent}
        open={selectedEvent !== null}
        onOpenChange={handleDetailClose}
        onEdit={handleEditClick}
        onDelete={handleDeleteClick}
        editDisabled={seriesQuery.isLoading}
      />

      {/* Scope dialog: "This occurrence" vs "Entire series" */}
      <EventScopeDialog
        open={scopeAction !== null}
        action={scopeAction ?? "edit"}
        onOpenChange={(o) => !o && setScopeAction(null)}
        onThisOccurrence={handleScopeThisOccurrence}
        onEntireSeries={handleScopeEntireSeries}
      />

      {/* Edit event sheet (shown after detail → scope dialog resolution) */}
      {selectedEvent && (
        <EventSheet
          open={editSheetOpen}
          onOpenChange={handleEditSheetClose}
          departmentId={seriesItem?.department_id ?? defaultDeptId}
          item={seriesItem}
          occurrenceDate={editOccurrenceOnly ? selectedEvent.original_date : null}
          onSuccess={() => {
            setEditSheetOpen(false)
            setSelectedEvent(null)
          }}
        />
      )}

      {/* Create event sheet */}
      <EventSheet
        open={createEventOpen}
        onOpenChange={(o) => { setCreateEventOpen(o); if (!o) setCreateStartDate(undefined) }}
        departmentId={defaultDeptId}
        initialStartDate={createStartDate}
      />
    </main>
  )
}
