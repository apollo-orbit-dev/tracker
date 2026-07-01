import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { MoreHorizontal, Plus } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DashboardDeleteDialog } from "@/components/widgets/DashboardDeleteDialog"
import { DashboardEditDialog } from "@/components/widgets/DashboardEditDialog"
import { DashboardLayout } from "@/components/widgets/DashboardLayout"
import { WidgetConfigSheet } from "@/components/widgets/WidgetConfigSheet"
import { WidgetFrame } from "@/components/widgets/WidgetFrame"
import { WidgetPickerDialog } from "@/components/widgets/WidgetPickerDialog"
import { WIDGET_BY_TYPE } from "@/components/widgets/WidgetLibrary"
import { ApiError } from "@/api/auth"
import {
  type Dashboard,
  useDashboardCreate,
  useDashboardDelete,
  useDashboardRename,
  useDashboards,
} from "@/api/dashboards"
import {
  type DashboardWidget,
  useDashboardWidgets,
  useWidgetRemove,
  useWidgetReorder,
  useWidgetWidthUpdate,
} from "@/api/dashboard_widgets"
import { useTopbarCrumbs } from "@/hooks/useTopbarCrumbs"
import { applyDragEnd } from "@/pages/dashboardDragEnd"

const ACTIVE_KEY = "tracker.activeDashboardId"

function readActiveId(): string | null {
  if (typeof localStorage === "undefined") return null
  return localStorage.getItem(ACTIVE_KEY)
}
function writeActiveId(id: string | null): void {
  if (typeof localStorage === "undefined") return
  if (id) localStorage.setItem(ACTIVE_KEY, id)
  else localStorage.removeItem(ACTIVE_KEY)
}

export function DashboardPage() {
  useTopbarCrumbs([{ label: "Dashboard" }])

  const dashboards = useDashboards()
  const createDashboard = useDashboardCreate()
  const renameDashboard = useDashboardRename()
  const deleteDashboard = useDashboardDelete()

  const [activeId, setActiveId] = useState<string | null>(readActiveId())
  // When the dashboards list resolves, snap activeId to a valid one.
  useEffect(() => {
    if (!dashboards.data) return
    const items = dashboards.data.items
    if (items.length === 0) return
    const known = new Set(items.map((d) => d.id))
    if (!activeId || !known.has(activeId)) {
      setActiveId(items[0].id)
    }
  }, [dashboards.data, activeId])
  useEffect(() => {
    writeActiveId(activeId)
  }, [activeId])

  const activeDashboard =
    dashboards.data?.items.find((d) => d.id === activeId) ?? null
  const onlyOneDashboard = (dashboards.data?.items.length ?? 0) <= 1

  const widgetsQ = useDashboardWidgets(activeId ?? undefined)
  // Mutation hooks need a non-empty string; calls only happen when
  // activeId is set since the UI gates them behind the active tab.
  const remove = useWidgetRemove(activeId ?? "")
  const reorder = useWidgetReorder(activeId ?? "")
  const resize = useWidgetWidthUpdate(activeId ?? "")

  const [customizing, setCustomizing] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [configuringId, setConfiguringId] = useState<string | null>(null)
  const [creatingDashboard, setCreatingDashboard] = useState(false)
  const [renamingDashboard, setRenamingDashboard] = useState(false)
  const [deletingDashboard, setDeletingDashboard] = useState<Dashboard | null>(
    null,
  )

  const [order, setOrder] = useState<DashboardWidget[]>([])
  // Mirrors `order`. Used inside drag handlers to read the current state
  // without stale-closure issues, and for optimistic-rollback on a
  // failed reorder PATCH.
  const orderRef = useRef<DashboardWidget[]>([])
  // Snapshot taken at dragStart so a cancelled / failed drag can revert.
  const preDragOrderRef = useRef<DashboardWidget[]>([])
  // Which widget is currently being dragged (drives the DragOverlay).
  const [draggingId, setDraggingId] = useState<string | null>(null)
  useEffect(() => {
    orderRef.current = order
  }, [order])
  useEffect(() => {
    if (widgetsQ.data) setOrder(widgetsQ.data.items)
  }, [widgetsQ.data])
  // Switching tabs resets the customize mode so the next tab doesn't
  // open mid-edit.
  useEffect(() => {
    setCustomizing(false)
  }, [activeId])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // Identify which "column-like container" a given dnd-kit id belongs to.
  // A half-width widget's container is its `column` (0 or 1). Full-width
  // widgets and empty-column placeholders are encoded explicitly. Used
  // in onDragOver to skip live state updates for within-column hovers
  // (where dnd-kit's CSS-transform shifting handles the visual on its own).
  function containerOf(id: string, widgets: DashboardWidget[]): string | null {
    const emptyMatch = /^empty-col-(\d+)-([01])$/.exec(id)
    if (emptyMatch) return `empty-${emptyMatch[1]}-${emptyMatch[2]}`
    const w = widgets.find((x) => x.id === id)
    if (!w) return null
    if (w.width === 2) return `full-${w.id}`
    return `col-${(w.column ?? 0) as 0 | 1}`
  }

  const onDragStart = (e: DragStartEvent) => {
    preDragOrderRef.current = orderRef.current
    setDraggingId(String(e.active.id))
  }

  const onDragOver = (e: DragOverEvent) => {
    if (!e.over) return
    const activeIdStr = String(e.active.id)
    const overIdStr = String(e.over.id)
    if (activeIdStr === overIdStr) return
    const current = orderRef.current
    // Full-width widgets terminate "runs", so moving them mid-drag
    // rebuilds the DashboardLayout's block structure under dnd-kit's
    // feet (run A splits into two runs etc.) and the active sortable
    // can lose its pointer registration. Defer the move to onDragEnd
    // for width=2 widgets — the DragOverlay still tracks the cursor.
    const activeWidget = current.find((w) => w.id === activeIdStr)
    if (activeWidget?.width === 2) return
    const activeContainer = containerOf(activeIdStr, current)
    const overContainer = containerOf(overIdStr, current)
    // Within the same container, let dnd-kit's intra-context CSS
    // transforms handle the shift. We only commit a state change when
    // the drag enters a different container, so the destination
    // SortableContext re-renders with the widget actually inserted —
    // that's what makes the other widgets move out of the way.
    if (activeContainer === overContainer || activeContainer === null) return
    const next = applyDragEnd(current, {
      active: { id: activeIdStr },
      over: { id: overIdStr },
    })
    if (next !== current) setOrder(next)
  }

  const onDragEnd = (e: DragEndEvent) => {
    setDraggingId(null)
    const prev = preDragOrderRef.current
    // No drop target → revert any in-flight cross-column updates to
    // the pre-drag layout.
    if (!e.over) {
      setOrder(prev)
      return
    }
    // The in-flight state mutated through onDragOver covers cross-column
    // moves. Apply the final event one more time so intra-column drags
    // (which onDragOver intentionally skipped) settle into their final
    // position, AND so cross-column drops onto a specific target land
    // adjacent to it rather than at the column's end.
    const next = applyDragEnd(orderRef.current, {
      active: { id: String(e.active.id) },
      over: { id: String(e.over.id) },
    })
    if (next !== orderRef.current) setOrder(next)
    // Only PATCH if anything actually changed from the pre-drag snapshot.
    const committed = next === orderRef.current ? orderRef.current : next
    if (!orderChanged(prev, committed)) return
    const items = committed.map((w) => ({
      id: w.id,
      column: (w.column ?? 0) as 0 | 1,
    }))
    reorder.mutate(items, {
      onError: (err) => {
        setOrder(prev)
        toast.error(err instanceof ApiError ? err.detail : "Reorder failed")
      },
    })
  }

  const onDragCancel = () => {
    setDraggingId(null)
    setOrder(preDragOrderRef.current)
  }

  const onRemoveWidget = (id: string) => {
    remove.mutate(id, {
      onSuccess: () => toast.success("Widget removed"),
      onError: (e) =>
        toast.error(e instanceof ApiError ? e.detail : "Remove failed"),
    })
  }

  const onToggleWidth = (w: DashboardWidget) => {
    resize.mutate(
      { id: w.id, width: w.width === 2 ? 1 : 2 },
      {
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.detail : "Resize failed"),
      },
    )
  }

  const onCreateDashboard = (name: string) => {
    createDashboard.mutate(name, {
      onSuccess: (d) => {
        setActiveId(d.id)
        setCreatingDashboard(false)
        toast.success("Dashboard created")
      },
      onError: (e) =>
        toast.error(e instanceof ApiError ? e.detail : "Create failed"),
    })
  }

  const onRenameDashboard = (name: string) => {
    if (!activeDashboard) return
    renameDashboard.mutate(
      { id: activeDashboard.id, name },
      {
        onSuccess: () => {
          setRenamingDashboard(false)
          toast.success("Dashboard renamed")
        },
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.detail : "Rename failed"),
      },
    )
  }

  const onConfirmDelete = () => {
    if (!deletingDashboard) return
    deleteDashboard.mutate(deletingDashboard.id, {
      onSuccess: () => {
        const remaining = (dashboards.data?.items ?? []).filter(
          (d) => d.id !== deletingDashboard.id,
        )
        setActiveId(remaining[0]?.id ?? null)
        setDeletingDashboard(null)
        toast.success("Dashboard deleted")
      },
      onError: (e) =>
        toast.error(e instanceof ApiError ? e.detail : "Delete failed"),
    })
  }

  const activeTypes = new Set(order.map((w) => w.widget_type))

  return (
    <main className="space-y-5 px-6 py-7">
      {/* 4.8.2: underline tab strip per the design reference.
          Active tab carries a primary-colored 2px underline; inactive
          tabs are muted-fg with a transparent underline so widths don't
          shift on selection. */}
      <div className="flex flex-wrap items-center gap-0.5 border-b">
        {(dashboards.data?.items ?? []).map((d) => {
          const selected = d.id === activeId
          return (
            <button
              key={d.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveId(d.id)}
              className={
                "relative -mb-px h-9 border-b-2 px-3 text-[13px] transition-colors " +
                (selected
                  ? "border-primary text-foreground font-semibold"
                  : "border-transparent text-muted-foreground font-medium hover:text-foreground")
              }
            >
              {d.name}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setCreatingDashboard(true)}
          aria-label="New dashboard"
          className="-mb-px flex h-9 w-[30px] items-center justify-center border-b-2 border-transparent text-[hsl(var(--subtle-fg))] hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </button>
        {activeDashboard && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Dashboard actions"
                className="ml-auto -mb-px"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setRenamingDashboard(true)}>
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={onlyOneDashboard}
                onSelect={() => setDeletingDashboard(activeDashboard)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">
          {activeDashboard?.name ?? "Your dashboard"}
        </h2>
        <div className="flex items-center gap-2">
          {customizing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPickerOpen(true)}
            >
              <Plus className="mr-1 size-3" />
              Add widget
            </Button>
          )}
          <Button
            type="button"
            variant={customizing ? "default" : "outline"}
            size="sm"
            onClick={() => setCustomizing((v) => !v)}
          >
            {customizing ? "Done" : "Customize"}
          </Button>
          </div>
        </div>

        {widgetsQ.isError && (
          <Alert variant="destructive">
            <AlertTitle>Couldn't load your dashboard</AlertTitle>
            <AlertDescription>{widgetsQ.error.detail}</AlertDescription>
          </Alert>
        )}

        {order.length === 0 && !widgetsQ.isLoading ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No widgets on this dashboard.{" "}
              <button
                type="button"
                onClick={() => {
                  setCustomizing(true)
                  setPickerOpen(true)
                }}
                className="font-medium underline"
              >
                Add one
              </button>
              .
            </CardContent>
          </Card>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          >
            <DashboardLayout
              widgets={order}
              customizing={customizing}
              renderWidget={(w) => {
                const desc = WIDGET_BY_TYPE[w.widget_type]
                if (!desc) return null
                const Component = desc.Component
                return (
                  <WidgetFrame
                    key={w.id}
                    id={w.id}
                    width={w.width}
                    customizing={customizing}
                    configurable={desc.configurable}
                    onRemove={() => onRemoveWidget(w.id)}
                    onConfigure={() => setConfiguringId(w.id)}
                    onToggleWidth={() => onToggleWidth(w)}
                  >
                    <Component
                      widget={w}
                      dashboardId={activeId!}
                      onConfigure={() => setConfiguringId(w.id)}
                    />
                  </WidgetFrame>
                )
              }}
            />
            <DragOverlay>
              {draggingId ? renderDragOverlay(order, draggingId, activeId!) : null}
            </DragOverlay>
          </DndContext>
        )}

        {activeId && (
          <>
            <WidgetPickerDialog
              dashboardId={activeId}
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              activeTypes={activeTypes}
            />
            <WidgetConfigSheet
              dashboardId={activeId}
              widget={
                configuringId
                  ? order.find((w) => w.id === configuringId) ?? null
                  : null
              }
              onOpenChange={(open) => !open && setConfiguringId(null)}
              onSuccess={() => toast.success("Widget configured")}
            />
          </>
        )}

        <DashboardEditDialog
          open={creatingDashboard}
          onOpenChange={setCreatingDashboard}
          title="New dashboard"
          description="Create a new tab. Widgets get the same default set as your first dashboard."
          initialName=""
          saveLabel="Create"
          savingLabel="Creating…"
          saving={createDashboard.isPending}
          onSave={onCreateDashboard}
        />
        <DashboardEditDialog
          open={renamingDashboard}
          onOpenChange={setRenamingDashboard}
          title="Rename dashboard"
          description="Change the tab's display name."
          initialName={activeDashboard?.name ?? ""}
          saveLabel="Save"
          savingLabel="Saving…"
          saving={renameDashboard.isPending}
          onSave={onRenameDashboard}
        />
        <DashboardDeleteDialog
          dashboard={deletingDashboard}
          onOpenChange={(open) => !open && setDeletingDashboard(null)}
          onConfirm={onConfirmDelete}
          pending={deleteDashboard.isPending}
        />
    </main>
  )
}

// ---- drag-overlay + diff helpers ---------------------------------------

/** Render a non-interactive clone of the dragged widget for the
 * DragOverlay. Crucially this does NOT call useSortable (which would
 * conflict with the active widget's own useSortable registration). */
function renderDragOverlay(
  widgets: DashboardWidget[],
  draggingId: string,
  dashboardId: string,
): React.ReactNode {
  const w = widgets.find((x) => x.id === draggingId)
  if (!w) return null
  const desc = WIDGET_BY_TYPE[w.widget_type]
  if (!desc) return null
  const Component = desc.Component
  return (
    <div className="rounded-md opacity-90 shadow-xl ring-2 ring-primary/40">
      <Component widget={w} dashboardId={dashboardId} onConfigure={() => {}} />
    </div>
  )
}

/** True iff order or column placement differs between two widget arrays. */
function orderChanged(
  a: DashboardWidget[],
  b: DashboardWidget[],
): boolean {
  if (a.length !== b.length) return true
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return true
    if ((a[i].column ?? 0) !== (b[i].column ?? 0)) return true
  }
  return false
}
