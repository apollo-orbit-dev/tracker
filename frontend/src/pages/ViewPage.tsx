// Phase 7.3 — custom view page (/views/:vid). Read mode renders the
// blocks chrome-free; edit mode (Edit button or keyboard `E`) adds
// inline rename, the add-block library, per-block kebab actions, and
// dnd-kit reorder persisted through the blocks reorder endpoint.
//
// SECURITY: text-block content is user input. It renders exclusively
// as a plain React text node (whitespace-pre-wrap) — never through any
// raw-HTML rendering mechanism.
import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable"
import { Check, Copy, MoreHorizontal, Pencil, Share2 } from "lucide-react"
import { toast } from "sonner"

import { ApiError } from "@/api/auth"
import { useTopbarCrumbs } from "@/hooks/useTopbarCrumbs"
import { useManageableDepartments } from "@/api/me"
import {
  type ChartBlockConfig,
  type MetricCardConfig,
  type ViewBlock,
  useBlockAdd,
  useBlockDuplicate,
  useBlockRemove,
  useBlockUpdate,
  useBlocksReorder,
  useViewBlocks,
  useViewDelete,
  useViewDuplicate,
  useViewPublish,
  useViewUnpublish,
  useViewUpdate,
  useViews,
} from "@/api/views"
import { Badge } from "@/components/Badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { InlineText } from "@/components/InlineText"
import { BlockConfigSheet } from "@/components/views/BlockConfigSheet"
import { BlockLibrary } from "@/components/views/BlockLibrary"
import { BlockShell } from "@/components/views/BlockShell"
import { BreakdownBlock } from "@/components/views/BreakdownBlock"
import { ChartBlock, type DrillGroup } from "@/components/views/ChartBlock"
import {
  DrillDownSheet,
  type DrillTarget,
} from "@/components/views/DrillDownSheet"
import { MarkdownText } from "@/components/views/MarkdownText"
import { MetricCardBlock } from "@/components/views/MetricCardBlock"
import { TableBlock } from "@/components/views/TableBlock"
import { ViewDeleteDialog } from "@/components/views/ViewDeleteDialog"
import { Button } from "@/components/ui/button"
import { applyBlocksDragEnd, type DragEndLike } from "./viewBlocksDragEnd"

export function ViewPage() {
  const { vid } = useParams<{ vid: string }>()
  const navigate = useNavigate()
  const views = useViews()
  const blocksQ = useViewBlocks(vid)
  const updateView = useViewUpdate(vid!)
  const deleteView = useViewDelete()
  const addBlock = useBlockAdd(vid!)
  const patchBlock = useBlockUpdate(vid!)
  const removeBlock = useBlockRemove(vid!)
  const duplicateBlock = useBlockDuplicate(vid!)
  const reorder = useBlocksReorder(vid!)
  const duplicateView = useViewDuplicate()
  const publishView = useViewPublish()
  const unpublishView = useViewUnpublish()

  const view = views.data?.items.find((v) => v.id === vid)
  // Edit affordances are gated on ownership (the backend enforces this
  // too — writes 404 for non-owners; this is the UI half). A reader can
  // never reach an edit surface.
  const isOwner = view?.is_owner ?? false
  // Manageable depts power the owner Share menu; only fetched for owners.
  const manageable = useManageableDepartments(isOwner)
  const [editing, setEditing] = useState(false)
  const [configuringId, setConfiguringId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  // Drill-down target (Phase 7.8) — available in read AND edit mode.
  const [drill, setDrill] = useState<DrillTarget | null>(null)
  const [order, setOrder] = useState<ViewBlock[]>([])
  useEffect(() => {
    if (blocksQ.data) setOrder(blocksQ.data.items)
  }, [blocksQ.data])

  // Leave edit mode when navigating between views.
  useEffect(() => {
    setEditing(false)
    setConfiguringId(null)
    setDeleting(false)
    setDrill(null)
  }, [vid])

  // A non-owner can never be in edit mode (read-only shared view).
  useEffect(() => {
    if (!isOwner) setEditing(false)
  }, [isOwner])

  // Keyboard: E toggles edit mode (owner pages only in sub-phase A).
  // Bails while the config sheet / delete dialog is up, while focus is
  // in a text-entry surface, or when the event originates inside any
  // dialog/menu — otherwise a stray `e` would unmount the sheet and
  // throw away unsaved config (7.3.1 review finding).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (configuringId !== null || deleting) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === "input" || tag === "textarea") return
      if (target?.isContentEditable) return
      if (target?.closest?.('[role="dialog"],[role="menu"]')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.toLowerCase() === "e" && isOwner) setEditing((v) => !v)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [configuringId, deleting, isOwner])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const onDragEnd = (event: DragEndLike) => {
    const next = applyBlocksDragEnd(order, event)
    if (next !== order) {
      const prev = order
      setOrder(next)
      reorder.mutate(
        next.map((b) => b.id),
        {
          onError: (e) => {
            setOrder(prev)
            toast.error(e instanceof ApiError ? e.detail : "Reorder failed")
          },
        },
      )
    }
  }

  const configuring = useMemo(
    () => order.find((b) => b.id === configuringId) ?? null,
    [order, configuringId],
  )

  useTopbarCrumbs(
    useMemo(() => [{ label: view?.name ?? "View" }], [view?.name]),
  )

  if (views.isLoading || blocksQ.isLoading) {
    return <p className="px-6 py-7 text-sm text-muted-foreground">Loading…</p>
  }
  if (!view) {
    return (
      <p className="px-6 py-7 text-sm text-muted-foreground">View not found.</p>
    )
  }

  return (
    <main className="space-y-5 px-6 py-7">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            {editing && isOwner ? (
              <InlineText
                value={view.name}
                maxLength={120}
                onCommit={(name) => {
                  // Match the server's 120-char limit before mutating.
                  const next = name.trim().slice(0, 120)
                  if (!next) return
                  updateView.mutate(
                    { name: next },
                    {
                      onError: (e) =>
                        toast.error(
                          e instanceof ApiError ? e.detail : "Rename failed",
                        ),
                    },
                  )
                }}
                className="text-xl font-semibold tracking-tight"
                inputClassName="bg-transparent text-xl font-semibold tracking-tight outline-none"
                ariaLabel="Rename view"
              />
            ) : (
              <h1 className="text-xl font-semibold tracking-tight">
                {view.name}
              </h1>
            )}
            {view.published_department_code && (
              <Badge tone="indigo">
                Shared · {view.published_department_code}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {isOwner
              ? "Personal view · only you can edit"
              : `Published by ${view.owner_name} · read-only`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isOwner ? (
            // Reader: read-only, but anyone with read access can fork a
            // personal copy.
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={duplicateView.isPending}
              onClick={() =>
                duplicateView.mutate(view.id, {
                  onSuccess: (v) => navigate(`/views/${v.id}`),
                  onError: (e) =>
                    toast.error(
                      e instanceof ApiError ? e.detail : "Duplicate failed",
                    ),
                })
              }
            >
              <Copy className="mr-1 size-3.5" /> Duplicate
            </Button>
          ) : !editing ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              <Pencil className="mr-1 size-3.5" /> Edit
            </Button>
          ) : (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="View actions"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => setDeleting(true)}
                  >
                    Delete view
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    <Share2 className="mr-1 size-3.5" /> Share
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(manageable.data ?? []).length === 0 ? (
                    <DropdownMenuItem disabled>
                      No departments you manage
                    </DropdownMenuItem>
                  ) : (
                    (manageable.data ?? []).map((d) => (
                      <DropdownMenuItem
                        key={d.id}
                        onSelect={() =>
                          publishView.mutate(
                            { viewId: view.id, departmentId: d.id },
                            {
                              onSuccess: () =>
                                toast.success(`Published to ${d.code}`),
                              onError: (e) =>
                                toast.error(
                                  e instanceof ApiError
                                    ? e.detail
                                    : "Publish failed",
                                ),
                            },
                          )
                        }
                      >
                        Publish to {d.code} — {d.name}
                      </DropdownMenuItem>
                    ))
                  )}
                  {view.published_department_id && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() =>
                          unpublishView.mutate(view.id, {
                            onSuccess: () => toast.success("Unpublished"),
                            onError: (e) =>
                              toast.error(
                                e instanceof ApiError
                                  ? e.detail
                                  : "Unpublish failed",
                              ),
                          })
                        }
                      >
                        Unpublish
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button type="button" size="sm" onClick={() => setEditing(false)}>
                <Check className="mr-1 size-3.5" /> Done
              </Button>
            </>
          )}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={order.map((b) => b.id)}
          strategy={rectSortingStrategy}
        >
          <div className="grid gap-4 md:grid-cols-4">
            {order.map((b) => (
              <BlockShell
                key={b.id}
                block={b}
                editing={editing}
                // Configured breakdown / Saved View tables render
                // flush so the row rules span the card.
                noPad={
                  (b.block_type === "breakdown" ||
                    b.block_type === "table") &&
                  b.config !== null
                }
                onConfigure={() => setConfiguringId(b.id)}
                onDuplicate={() =>
                  duplicateBlock.mutate(b.id, {
                    onError: (e) =>
                      toast.error(
                        e instanceof ApiError ? e.detail : "Duplicate failed",
                      ),
                  })
                }
                onRemove={() =>
                  removeBlock.mutate(b.id, {
                    onError: (e) =>
                      toast.error(
                        e instanceof ApiError ? e.detail : "Remove failed",
                      ),
                  })
                }
                onRename={(title) =>
                  // Match the server's 200-char title limit before mutating.
                  patchBlock.mutate(
                    { blockId: b.id, title: title.slice(0, 200) || null },
                    {
                      onError: (e) =>
                        toast.error(
                          e instanceof ApiError ? e.detail : "Rename failed",
                        ),
                    },
                  )
                }
              >
                {b.block_type === "metric" ? (
                  <MetricCardBlock
                    viewId={vid!}
                    block={b}
                    onConfigure={() => setConfiguringId(b.id)}
                    // Whole-metric drill: the card's stored metric,
                    // no group.
                    onDrill={() => {
                      const cfg = b.config as unknown as MetricCardConfig | null
                      if (!cfg?.metric) return
                      setDrill({
                        metric: cfg.metric,
                        title: b.title ?? "Untitled block",
                      })
                    }}
                  />
                ) : b.block_type === "chart" ? (
                  <ChartBlock
                    viewId={vid!}
                    block={b}
                    onConfigure={() => setConfiguringId(b.id)}
                    // Group drill: group_value comes from the 7.5.1
                    // isNull flag ("—" bucket → null), never label
                    // matching. Boolean labels are exactly
                    // "True"/"False" and pass through as-is. "Other"
                    // is disabled inside ChartBlock and never lands
                    // here.
                    onDrill={(group: DrillGroup | null) => {
                      const cfg = b.config as unknown as ChartBlockConfig | null
                      if (!cfg?.metric) return
                      const title = b.title ?? "Untitled block"
                      if (group === null) {
                        setDrill({ metric: cfg.metric, title })
                        return
                      }
                      setDrill({
                        metric: cfg.metric,
                        groupBy: cfg.group_by,
                        groupValue: group.isNull ? null : group.label,
                        title: `${title} · ${group.label}`,
                      })
                    }}
                  />
                ) : b.block_type === "breakdown" ? (
                  <BreakdownBlock
                    viewId={vid!}
                    block={b}
                    onConfigure={() => setConfiguringId(b.id)}
                  />
                ) : b.block_type === "table" ? (
                  <TableBlock
                    block={b}
                    onConfigure={() => setConfiguringId(b.id)}
                  />
                ) : (
                  <MarkdownText
                    md={String(
                      (b.config as { md?: string } | null)?.md ?? "",
                    )}
                    sizePreset={
                      (
                        b.config as {
                          size_preset?: "heading" | "body" | "caption"
                        } | null
                      )?.size_preset ?? "body"
                    }
                  />
                )}
              </BlockShell>
            ))}
            {editing && (
              <BlockLibrary
                firstBlock={order.length === 0}
                onAdd={(t) =>
                  addBlock.mutate(
                    { block_type: t },
                    {
                      onSuccess: (b) => setConfiguringId(b.id),
                      onError: (e) =>
                        toast.error(
                          e instanceof ApiError ? e.detail : "Add failed",
                        ),
                    },
                  )
                }
              />
            )}
          </div>
        </SortableContext>
      </DndContext>

      {!editing && order.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {isOwner
            ? "This view has no blocks yet — press Edit to start building."
            : "This view has no blocks yet."}
        </p>
      )}

      {editing && configuring && (
        <BlockConfigSheet
          viewId={vid!}
          block={configuring}
          onClose={() => setConfiguringId(null)}
        />
      )}
      <DrillDownSheet open={drill} onClose={() => setDrill(null)} />

      <ViewDeleteDialog
        open={deleting}
        viewName={view.name}
        onOpenChange={setDeleting}
        pending={deleteView.isPending}
        onConfirm={() =>
          deleteView.mutate(view.id, {
            onSuccess: () => navigate("/"),
            onError: (e) =>
              toast.error(
                e instanceof ApiError ? e.detail : "Delete failed",
              ),
          })
        }
      />
    </main>
  )
}
