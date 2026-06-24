import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ChevronDown,
  ClipboardList,
  FileSignature,
  Flag,
  GripVertical,
  LayoutList,
  MessageSquare,
  MoreHorizontal,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { toast } from "sonner"

import { Badge } from "@/components/Badge"
import { AssignmentDeleteDialog } from "@/components/AssignmentDeleteDialog"
import { AssignmentSheet } from "@/components/AssignmentSheet"
import { AssignmentStatusBadge } from "@/components/AssignmentStatusBadge"
import { AssignmentStatusControl } from "@/components/AssignmentStatusControl"
import { CORDeleteDialog } from "@/components/CORDeleteDialog"
import { CORSheet } from "@/components/CORSheet"
import { CORStatusBadge } from "@/components/CORStatusBadge"
import { FieldValueInput } from "@/components/FieldValueInput"
import { InlineText } from "@/components/InlineText"
import { Panel } from "@/components/Panel"
import { MilestoneDeleteDialog } from "@/components/MilestoneDeleteDialog"
import { MilestoneSheet } from "@/components/MilestoneSheet"
import { ProjectDeleteDialog } from "@/components/ProjectDeleteDialog"
import { ProjectSheet } from "@/components/ProjectSheet"
import { RightSidebar } from "@/pages/project-detail/RightSidebar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/api/auth"
import { type Assignment, useAssignmentList } from "@/api/assignments"
import { type COR, useCORList } from "@/api/cors"
import {
  useNoteCreate,
  useNoteDelete,
  useNoteList,
  useNoteUpdate,
} from "@/api/notes"
import { ProjectAccessSheet } from "@/components/ProjectAccessSheet"
import {
  type Milestone,
  type Project,
  useMilestoneReorder,
  useMilestoneUpdate,
  useProject,
  useProjectTransition,
  useProjectUpdate,
} from "@/api/projects"
import { useAuth } from "@/hooks/useAuth"
import { useTopbarCrumbs } from "@/hooks/useTopbarCrumbs"
import { formatCurrency } from "@/lib/format"
import { lifecycleLabel, lifecycleTone } from "@/lib/lifecycle"
import { hasRole } from "@/lib/roles"

function detailReasons(err: ApiError | null): string[] {
  if (!err) return []
  return err.detail.split("; ")
}

type ProjectDetailPageProps = {
  /** When set, overrides `useParams` — used by the projects-list Split
   *  layout to embed this page's content inside the right column. */
  pid?: string
  /** Skips topbar crumbs and fixed-position right sidebar so the page
   *  body sits naturally inside a parent container (e.g., SplitBody). */
  embedded?: boolean
}

export function ProjectDetailPage({
  pid: pidProp,
  embedded = false,
}: ProjectDetailPageProps = {}) {
  const params = useParams<{ pid: string }>()
  const pid = pidProp ?? params.pid
  const navigate = useNavigate()
  const { data: user } = useAuth()
  const project = useProject(pid)

  const updateProject = useProjectUpdate()
  const updateMilestone = useMilestoneUpdate(pid ?? "")
  const reorderMilestones = useMilestoneReorder(pid ?? "")
  const transition = useProjectTransition(pid ?? "")

  // Phase 3.0.2: trust the server-computed per-project flag rather than
  // deriving from the user's flat role list — a user with project_editor
  // in dept A and viewer (org or dept) in dept B would otherwise see edit
  // controls on dept-B projects where the backend would 403 them.
  const canEdit = !!project.data?.can_edit
  const isAdmin = !!user && hasRole(user.roles, "admin")

  // Phase 4.3: topbar breadcrumb trail. Falls back to a single "Projects"
  // crumb while the project is still loading; once loaded, append the
  // Project # (links back to the list) and the project's title.
  const crumbs = useMemo(
    () => {
      if (!project.data) return [{ label: "Projects", to: "/projects" }]
      return [
        { label: "Projects", to: "/projects" },
        {
          label: project.data.project_number,
          to: `/projects/${project.data.id}`,
        },
        { label: project.data.title },
      ]
    },
    [project.data],
  )
  // In embedded mode the parent (e.g., projects-list Split layout) owns
  // the topbar crumbs — pass null to opt this page out entirely.
  useTopbarCrumbs(embedded ? null : crumbs)

  const [milestoneSheetOpen, setMilestoneSheetOpen] = useState(false)
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(
    null,
  )
  const [deletingMilestone, setDeletingMilestone] = useState<Milestone | null>(
    null,
  )

  // Local order state for optimistic drag-reorder.
  const [milestoneOrder, setMilestoneOrder] = useState<Milestone[]>([])
  useEffect(() => {
    if (project.data) setMilestoneOrder(project.data.milestones)
  }, [project.data])

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Custom-fields local state (dirty-tracked vs server)
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({})
  useEffect(() => {
    if (project.data) setFieldValues(project.data.custom_field_values ?? {})
  }, [project.data])
  const dirty = useMemo(() => {
    if (!project.data) return false
    return (
      JSON.stringify(fieldValues) !==
      JSON.stringify(project.data.custom_field_values ?? {})
    )
  }, [fieldValues, project.data])

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [accessSheetOpen, setAccessSheetOpen] = useState(false)
  const canManageAccess = !!project.data?.can_manage_access

  // Milestone date local state for save-on-blur
  const [localDates, setLocalDates] = useState<
    Record<string, { planned_date: string | null; actual_date: string | null }>
  >({})
  useEffect(() => {
    if (project.data) {
      const next: Record<
        string,
        { planned_date: string | null; actual_date: string | null }
      > = {}
      for (const m of project.data.milestones) {
        next[m.id] = {
          planned_date: m.planned_date,
          actual_date: m.actual_date,
        }
      }
      setLocalDates(next)
    }
  }, [project.data])

  if (project.isLoading) {
    return (
      <main className={embedded ? "space-y-4 p-4" : "space-y-4 px-6 py-7"}>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    )
  }

  if (project.isError) {
    const err = project.error
    const notFound = err instanceof ApiError && err.status === 404
    return (
      <main className={embedded ? "space-y-4 p-4" : "space-y-4 px-6 py-7"}>
        <Alert variant="destructive">
          <AlertTitle>
            {notFound ? "Project not found" : "Couldn't load project"}
          </AlertTitle>
          <AlertDescription>
            {err.detail}{" "}
            <Link to="/projects" className="underline">
              Back to projects
            </Link>
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  const p = project.data!
  // Phase 3.0.3: embedded by the backend so direct-grant users (who
  // can't read the dept-scoped /api/admin/templates endpoint) still get
  // the DEPT · CLIENT · DISC string in the header.
  const intersection = p.template_intersection || "—"
  const fieldDefList = p.template_field_defs

  const onSaveFields = () => {
    updateProject.mutate(
      { id: p.id, body: { custom_field_values: fieldValues } },
      {
        onSuccess: () => {
          toast.success("Custom fields saved")
        },
      },
    )
  }

  const onMilestoneBlur = (
    mid: string,
    key: "planned_date" | "actual_date",
    next: string | null,
  ) => {
    const original = p.milestones.find((m) => m.id === mid)
    if (!original) return
    if ((original[key] ?? null) === next) return
    updateMilestone.mutate(
      { id: mid, body: { [key]: next } },
      {
        onSuccess: () => toast.success("Milestone updated"),
      },
    )
  }

  const transitionError =
    transition.error instanceof ApiError ? transition.error : null
  const cfError =
    updateProject.error instanceof ApiError ? updateProject.error : null

  // Embedded mode drops the page-level padding + right-rail gutter
  // since the parent container (e.g., SplitBody's right column)
  // already provides its own padding/scrolling.
  return (
    <main className={embedded ? "p-4" : "px-6 py-7 lg:pr-[336px]"}>
      <div className="min-w-0 space-y-5">
        {/* Hero: status + change-state + h1 + meta line. */}
        <section className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={lifecycleTone(p.lifecycle_state)} dot>
              {lifecycleLabel(p.lifecycle_state)}
            </Badge>
            {canEdit && p.valid_next_states.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={transition.isPending}
                  >
                    Change state
                    <ChevronDown className="ml-1 size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {p.valid_next_states.map((s) => (
                    <DropdownMenuItem
                      key={s}
                      onSelect={() => transition.mutate(s)}
                    >
                      Move to {lifecycleLabel(s)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <div className="ml-auto flex items-center gap-2">
              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Project actions"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                      Rename
                    </DropdownMenuItem>
                    {canManageAccess && (
                      <DropdownMenuItem
                        onSelect={() => setAccessSheetOpen(true)}
                      >
                        Manage access
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setDeleteOpen(true)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          <h1 className="text-[22px] font-bold tracking-tight">
            <InlineText
              value={p.title}
              disabled={!canEdit}
              ariaLabel="Project title"
              className="w-full"
              inputClassName="w-full bg-transparent border-0 p-0 text-[22px] font-bold tracking-tight focus-visible:outline-none"
              onCommit={(next) => {
                const trimmed = next.trim()
                if (!trimmed) {
                  toast.error("Title cannot be empty")
                  return
                }
                updateProject.mutate(
                  { id: p.id, body: { title: trimmed } },
                  {
                    onError: (e) => toast.error(e.detail),
                  },
                )
              }}
            />
          </h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{p.project_number}</span>{" "}
            · {intersection}
            {p.client_project_number && (
              <>
                {" "}· client #{" "}
                <span className="font-mono">{p.client_project_number}</span>
              </>
            )}
          </p>
          {transitionError && (
            <Alert variant="destructive">
              <AlertTitle>Transition blocked</AlertTitle>
              <AlertDescription>
                <ul className="list-inside list-disc">
                  {detailReasons(transitionError).map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </section>

        {/* Custom fields */}
        <Panel
          icon={LayoutList}
          title="Custom fields"
          subtitle="Defined by the project's template."
          collapsible
        >
          <div className="space-y-4 p-4">
            {cfError && (
              <Alert variant="destructive">
                <AlertTitle>Save failed</AlertTitle>
                <AlertDescription>
                  <ul className="list-inside list-disc">
                    {detailReasons(cfError).map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {fieldDefList.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No custom fields defined on this template.
              </p>
            ) : (
              <div className="space-y-4">
                {fieldDefList.map((fd) => (
                  <div key={fd.id} className="space-y-1">
                    <Label>
                      {fd.name}
                      {fd.required && (
                        <span className="text-destructive"> *</span>
                      )}
                    </Label>
                    <FieldValueInput
                      field={fd}
                      value={fieldValues[fd.id] ?? null}
                      onChange={(v) =>
                        setFieldValues({ ...fieldValues, [fd.id]: v })
                      }
                      disabled={!canEdit}
                    />
                  </div>
                ))}
                {canEdit && (
                  <div className="flex justify-end">
                    <Button
                      onClick={onSaveFields}
                      disabled={!dirty || updateProject.isPending}
                    >
                      {updateProject.isPending ? "Saving…" : "Save changes"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </Panel>

        {/* Milestones */}
        <Panel
          icon={Flag}
          title="Milestones"
          subtitle="Planned and actual dates. Required to reach Active."
          collapsible
          action={
            canEdit ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingMilestone(null)
                  setMilestoneSheetOpen(true)
                }}
                >
                New milestone
              </Button>
            ) : undefined
          }
        >
          <div className="p-4">
            {milestoneOrder.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No milestones yet.
              </p>
            ) : (
              <DndContext
                sensors={dndSensors}
                collisionDetection={closestCenter}
                onDragEnd={(event: DragEndEvent) => {
                  if (!canEdit) return
                  const { active, over } = event
                  if (!over || active.id === over.id) return
                  const oldIdx = milestoneOrder.findIndex(
                    (m) => m.id === active.id,
                  )
                  const newIdx = milestoneOrder.findIndex(
                    (m) => m.id === over.id,
                  )
                  if (oldIdx < 0 || newIdx < 0) return
                  const next = arrayMove(milestoneOrder, oldIdx, newIdx)
                  setMilestoneOrder(next)
                  reorderMilestones.mutate(next.map((m) => m.id))
                }}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="w-[28px] py-2"></th>
                        <th className="py-2 pr-3">Name</th>
                        <th className="w-[110px] py-2 pr-3">Direction</th>
                        <th className="w-[110px] py-2 pr-3">Date model</th>
                        <th className="w-[160px] py-2 pr-3">Planned</th>
                        <th className="w-[160px] py-2 pr-3">Actual</th>
                        <th className="w-[40px] py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <SortableContext
                        items={milestoneOrder.map((m) => m.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {milestoneOrder.map((m) => (
                          <MilestoneRow
                            key={m.id}
                            m={m}
                            canEdit={canEdit}
                            local={localDates[m.id] ?? {
                              planned_date: m.planned_date,
                              actual_date: m.actual_date,
                            }}
                            onLocalChange={(field, value) => {
                              setLocalDates({
                                ...localDates,
                                [m.id]: {
                                  ...(localDates[m.id] ?? {
                                    planned_date: m.planned_date,
                                    actual_date: m.actual_date,
                                  }),
                                  [field]: value,
                                },
                              })
                            }}
                            onBlur={(field, value) =>
                              onMilestoneBlur(m.id, field, value)
                            }
                            onEdit={() => {
                              setEditingMilestone(m)
                              setMilestoneSheetOpen(true)
                            }}
                            onDelete={() => setDeletingMilestone(m)}
                          />
                        ))}
                      </SortableContext>
                    </tbody>
                  </table>
                </div>
              </DndContext>
            )}
          </div>
        </Panel>

        {/* CORs */}
        <CORsCard pid={pid ?? ""} canEdit={canEdit} />

        {/* Assignments */}
        <AssignmentsCard
          pid={pid ?? ""}
          canEdit={canEdit}
          currentUserId={user?.id ?? ""}
          milestones={(p.milestones ?? []).map((m) => ({ id: m.id, name: m.name }))}
        />

        {/* Notes */}
        <NotesCard pid={pid ?? ""} currentUserId={user?.id ?? ""} isAdmin={isAdmin} />

        <ProjectSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          item={p as Project}
          onSuccess={() => toast.success("Project updated")}
        />
        {pid && (
          <ProjectAccessSheet
            pid={pid}
            projectTitle={p?.title ?? ""}
            open={accessSheetOpen}
            onOpenChange={setAccessSheetOpen}
          />
        )}
        <ProjectDeleteDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          item={p as Project}
          onDeleted={() => {
            toast.success("Project deleted")
            navigate("/projects", { replace: true })
          }}
        />
        {pid && (
          <>
            <MilestoneSheet
              pid={pid}
              open={milestoneSheetOpen}
              onOpenChange={setMilestoneSheetOpen}
              item={editingMilestone}
              onSuccess={() =>
                toast.success(
                  editingMilestone ? "Milestone updated" : "Milestone created",
                )
              }
            />
            <MilestoneDeleteDialog
              pid={pid}
              open={deletingMilestone !== null}
              onOpenChange={(open) => !open && setDeletingMilestone(null)}
              item={deletingMilestone}
              onDeleted={() => toast.success("Milestone deleted")}
            />
          </>
        )}
      </div>

      {/* RightSidebar is fixed-positioned at the viewport edge — only
          makes sense when this page owns the viewport (not embedded). */}
      {!embedded && <RightSidebar project={p} canEdit={canEdit} />}
    </main>
  )
}

function MilestoneRow({
  m,
  canEdit,
  local,
  onLocalChange,
  onBlur,
  onEdit,
  onDelete,
}: {
  m: Milestone
  canEdit: boolean
  local: { planned_date: string | null; actual_date: string | null }
  onLocalChange: (field: "planned_date" | "actual_date", value: string | null) => void
  onBlur: (field: "planned_date" | "actual_date", value: string | null) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: m.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }
  const isAdhoc = m.template_milestone_def_id === null

  return (
    <tr ref={setNodeRef} style={style} className="border-t">
      <td className="w-[28px] p-0">
        {canEdit && (
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            type="button"
            aria-label={`Drag to reorder ${m.name}`}
            className="flex h-9 w-7 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </button>
        )}
      </td>
      <td className="py-2 pr-3 font-medium">
        {m.name}
        {isAdhoc && (
          <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
            ad-hoc
          </span>
        )}
      </td>
      <td className="py-2 pr-3 text-xs text-muted-foreground">{m.direction}</td>
      <td className="py-2 pr-3 text-xs text-muted-foreground">{m.date_model}</td>
      <td className="py-2 pr-3">
        <Input
          type="date"
          value={local.planned_date ?? ""}
          onChange={(e) =>
            onLocalChange(
              "planned_date",
              e.target.value === "" ? null : e.target.value,
            )
          }
          onBlur={(e) =>
            onBlur(
              "planned_date",
              e.target.value === "" ? null : e.target.value,
            )
          }
          disabled={!canEdit}
          aria-label={`Planned date for ${m.name}`}
        />
      </td>
      <td className="py-2 pr-3">
        {m.date_model === "planned_actual" ? (
          <Input
            type="date"
            value={local.actual_date ?? ""}
            onChange={(e) =>
              onLocalChange(
                "actual_date",
                e.target.value === "" ? null : e.target.value,
              )
            }
            onBlur={(e) =>
              onBlur(
                "actual_date",
                e.target.value === "" ? null : e.target.value,
              )
            }
            disabled={!canEdit}
            aria-label={`Actual date for ${m.name}`}
          />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-2">
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${m.name}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={onDelete}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </td>
    </tr>
  )
}

function CORsCard({ pid, canEdit }: { pid: string; canEdit: boolean }) {
  const list = useCORList(pid)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<COR | null>(null)
  const [deleting, setDeleting] = useState<COR | null>(null)

  const items = list.data?.items ?? []

  return (
    <Panel
      icon={FileSignature}
      title="Change orders"
      subtitle="CORs for this project. Numbers are unique within the project."
      collapsible
      action={
        canEdit ? (
          <Button
            size="sm"
            onClick={() => {
              setEditing(null)
              setSheetOpen(true)
            }}
          >
            New COR
          </Button>
        ) : undefined
      }
    >
      <div className="p-4">
        {list.isError && (
          <Alert variant="destructive">
            <AlertTitle>Couldn't load CORs</AlertTitle>
            <AlertDescription>{list.error.detail}</AlertDescription>
          </Alert>
        )}
        {list.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No CORs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="w-[120px] py-2 pr-3">Number</th>
                  <th className="py-2 pr-3">Description</th>
                  <th className="w-[120px] py-2 pr-3 text-right">Amount</th>
                  <th className="w-[100px] py-2 pr-3">Status</th>
                  <th className="w-[120px] py-2 pr-3">Submitted</th>
                  <th className="w-[120px] py-2 pr-3">Approved</th>
                  <th className="w-[40px] py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="py-2 pr-3 font-mono text-xs">{c.number}</td>
                    <td className="py-2 pr-3">
                      <span className="line-clamp-2 text-sm">
                        {c.description}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-xs">
                      {formatCurrency(c.amount)}
                    </td>
                    <td className="py-2 pr-3">
                      <CORStatusBadge status={c.status} />
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {c.submitted_date ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {c.approved_date ?? "—"}
                    </td>
                    <td className="py-2">
                      {canEdit && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Actions for ${c.number}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => {
                                setEditing(c)
                                setSheetOpen(true)
                              }}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => setDeleting(c)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <CORSheet
        pid={pid}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        item={editing}
        onSuccess={() =>
          toast.success(editing ? "COR updated" : "COR created")
        }
      />
      <CORDeleteDialog
        pid={pid}
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        item={deleting}
        onDeleted={() => toast.success("COR deleted")}
      />
    </Panel>
  )
}

function AssignmentsCard({
  pid,
  canEdit,
  currentUserId,
  milestones,
}: {
  pid: string
  canEdit: boolean
  currentUserId: string
  milestones: { id: string; name: string }[]
}) {
  const list = useAssignmentList(pid)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Assignment | null>(null)
  const [deleting, setDeleting] = useState<Assignment | null>(null)

  const items = list.data?.items ?? []

  return (
    <Panel
      icon={ClipboardList}
      title="Assignments"
      subtitle="Work assigned to people who can view this project."
      collapsible
      action={
        canEdit ? (
          <Button
            size="sm"
            onClick={() => {
              setEditing(null)
              setSheetOpen(true)
            }}
          >
            New assignment
          </Button>
        ) : undefined
      }
    >
      <div className="p-4">
        {list.isError && (
          <Alert variant="destructive">
            <AlertTitle>Couldn't load assignments</AlertTitle>
            <AlertDescription>{list.error.detail}</AlertDescription>
          </Alert>
        )}
        {list.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assignments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="w-[140px] py-2 pr-3">Milestone</th>
                  <th className="py-2 pr-3">Description</th>
                  <th className="w-[140px] py-2 pr-3">Assignee</th>
                  <th className="w-[110px] py-2 pr-3">Status</th>
                  <th className="w-[110px] py-2 pr-3">Due</th>
                  <th className="w-[40px] py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {a.milestone_name ?? "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="line-clamp-2 text-sm">
                        {a.description}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs">{a.assignee_name}</td>
                    <td className="py-2 pr-3">
                      {canEdit || a.assignee_user_id === currentUserId ? (
                        <AssignmentStatusControl pid={pid} assignment={a} />
                      ) : (
                        <AssignmentStatusBadge status={a.status} />
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {a.due_date ?? "—"}
                    </td>
                    <td className="py-2">
                      {canEdit && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Actions for ${a.description}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => {
                                setEditing(a)
                                setSheetOpen(true)
                              }}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => setDeleting(a)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <AssignmentSheet
        pid={pid}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        milestones={milestones}
        item={editing}
        onSuccess={() =>
          toast.success(editing ? "Assignment updated" : "Assignment created")
        }
      />
      <AssignmentDeleteDialog
        pid={pid}
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        item={deleting}
        onSuccess={() => toast.success("Assignment deleted")}
      />
    </Panel>
  )
}

function NotesCard({
  pid,
  currentUserId,
  isAdmin,
}: {
  pid: string
  currentUserId: string
  isAdmin: boolean
}) {
  const PAGE_SIZE = 5
  const [page, setPage] = useState(0)
  const list = useNoteList(pid, { limit: PAGE_SIZE, offset: page * PAGE_SIZE })
  const create = useNoteCreate(pid)
  const update = useNoteUpdate(pid)
  const del = useNoteDelete(pid)

  const [draft, setDraft] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState("")

  const items = list.data?.items ?? []
  const total = list.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  // If a delete or page change leaves us past the end, clamp.
  useEffect(() => {
    if (page > 0 && page >= totalPages) {
      setPage(Math.max(0, totalPages - 1))
    }
  }, [page, totalPages])

  const createError =
    create.error instanceof ApiError ? create.error : null

  const submitNew = () => {
    if (!draft.trim()) return
    create.mutate(
      { body: draft.trim() },
      {
        onSuccess: () => {
          setDraft("")
          setPage(0) // newest note is on page 0
          toast.success("Note posted")
        },
      },
    )
  }

  const saveEdit = (id: string) => {
    if (!editDraft.trim()) return
    update.mutate(
      { id, body: editDraft.trim() },
      {
        onSuccess: () => {
          setEditingId(null)
          setEditDraft("")
          toast.success("Note updated")
        },
      },
    )
  }

  return (
    <Panel
      icon={MessageSquare}
      title="Notes"
      subtitle="Time-ordered project notes. Anyone signed in can post."
      collapsible
    >
      <div className="space-y-4 p-4">
        {createError && (
          <Alert variant="destructive">
            <AlertTitle>Post failed</AlertTitle>
            <AlertDescription>{createError.detail}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-2">
          <Textarea
            placeholder="Add a note…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            aria-label="New note"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={submitNew}
              disabled={create.isPending || !draft.trim()}
            >
              {create.isPending ? "Posting…" : "Post note"}
            </Button>
          </div>
        </div>

        {list.isError && (
          <Alert variant="destructive">
            <AlertTitle>Couldn't load notes</AlertTitle>
            <AlertDescription>{list.error.detail}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          {list.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            items.map((n) => {
              const isAuthor = n.created_by.id === currentUserId
              const editing = editingId === n.id
              return (
                <div
                  key={n.id}
                  className="rounded-md border bg-background p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium">
                        {n.created_by.display_name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                      {n.updated_at !== n.created_at && (
                        <span className="text-xs text-muted-foreground">
                          (edited)
                        </span>
                      )}
                    </div>
                    {(isAuthor || isAdmin) && !editing && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label="Note actions"
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {isAuthor && (
                            <DropdownMenuItem
                              onSelect={() => {
                                setEditingId(n.id)
                                setEditDraft(n.body)
                              }}
                            >
                              Edit
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => {
                              if (confirm("Delete this note?")) {
                                del.mutate(n.id, {
                                  onSuccess: () =>
                                    toast.success("Note deleted"),
                                })
                              }
                            }}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  {editing ? (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={3}
                        aria-label={`Edit note by ${n.created_by.display_name}`}
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingId(null)
                            setEditDraft("")
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => saveEdit(n.id)}
                          disabled={
                            update.isPending || !editDraft.trim()
                          }
                        >
                          {update.isPending ? "Saving…" : "Save"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 whitespace-pre-wrap">{n.body}</p>
                  )}
                </div>
              )
            })
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t pt-3 text-sm">
            <span className="text-muted-foreground">
              Page {page + 1} of {totalPages} · {total} note
              {total === 1 ? "" : "s"}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setPage((p) => Math.min(totalPages - 1, p + 1))
                }
                disabled={page >= totalPages - 1}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  )
}

