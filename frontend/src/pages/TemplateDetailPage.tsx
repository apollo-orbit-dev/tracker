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
  ChevronRight,
  Flag,
  GripVertical,
  LayoutList,
  MoreHorizontal,
  Plus,
} from "lucide-react"
import { type CSSProperties, useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router"
import { toast } from "sonner"

import { Badge } from "@/components/Badge"
import { Panel } from "@/components/Panel"
import { FieldDefDeleteDialog } from "@/components/FieldDefDeleteDialog"
import { FieldDefSheet } from "@/components/FieldDefSheet"
import { MilestoneDefDeleteDialog } from "@/components/MilestoneDefDeleteDialog"
import { MilestoneDefSheet } from "@/components/MilestoneDefSheet"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useTopbarCrumbs } from "@/hooks/useTopbarCrumbs"
import { ApiError } from "@/api/auth"
import { useMyDepartments } from "@/api/me"
import { useTaxonomyList } from "@/api/taxonomy"
import {
  type FieldDef,
  type MilestoneDef,
  useFieldDefReorder,
  useFieldDefs,
  useMilestoneDefReorder,
  useMilestoneDefs,
  useTemplate,
} from "@/api/templates"
import {
  fieldTypeLabel,
  fieldTypeTone,
  MILESTONE_DIRECTIONS,
  milestoneDirectionTone,
} from "@/lib/field-types"

const DIRECTION_LABEL: Record<string, string> = Object.fromEntries(
  MILESTONE_DIRECTIONS.map((d) => [d.value, d.label]),
)

const DATE_MODEL_LABEL: Record<string, string> = {
  single: "Single date",
  planned_actual: "Planned + actual",
}

const DENSITY_ROW_STYLE: CSSProperties = {
  height: "var(--row-h)",
  fontSize: "var(--fs-table)",
}
const DENSITY_CELL_STYLE: CSSProperties = {
  paddingTop: "var(--row-py)",
  paddingBottom: "var(--row-py)",
}

function codeFromList(
  items: { id: string; code: string }[] | undefined,
  id: string | undefined,
): string {
  if (!id) return "?"
  return items?.find((i) => i.id === id)?.code ?? "?"
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-[5px] border bg-muted/40 px-1.5 py-0.5 font-mono text-[11.75px] text-foreground">
      {children}
    </span>
  )
}

// ---- sortable row helpers ------------------------------------------------

function DragHandleCell({ id }: { id: string }) {
  const { attributes, listeners, setActivatorNodeRef } = useSortable({ id })
  return (
    <TableCell className="w-[36px] p-0" style={DENSITY_CELL_STYLE}>
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="flex h-9 w-9 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
    </TableCell>
  )
}

function SortableTableRow({
  id,
  children,
}: {
  id: string
  children: React.ReactNode
}) {
  const { setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    position: "relative",
    ...DENSITY_ROW_STYLE,
  }
  return (
    <TableRow ref={setNodeRef} style={style}>
      <DragHandleCell id={id} />
      {children}
    </TableRow>
  )
}

// ---- page ---------------------------------------------------------------

export function TemplateDetailPage() {
  const { tid } = useParams<{ tid: string }>()
  const template = useTemplate(tid)
  const fields = useFieldDefs(tid)
  const milestones = useMilestoneDefs(tid)
  const depts = useMyDepartments()
  const clients = useTaxonomyList("clients", true)
  const disciplines = useTaxonomyList("disciplines", true)

  const reorderFields = useFieldDefReorder(tid ?? "")
  const reorderMilestones = useMilestoneDefReorder(tid ?? "")

  // Local order state so optimistic reorder happens immediately.
  const [fieldOrder, setFieldOrder] = useState<FieldDef[]>([])
  const [milestoneOrder, setMilestoneOrder] = useState<MilestoneDef[]>([])

  useEffect(() => {
    if (fields.data) setFieldOrder(fields.data.items)
  }, [fields.data])
  useEffect(() => {
    if (milestones.data) setMilestoneOrder(milestones.data.items)
  }, [milestones.data])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const [fieldSheetOpen, setFieldSheetOpen] = useState(false)
  const [editingField, setEditingField] = useState<FieldDef | null>(null)
  const [deletingField, setDeletingField] = useState<FieldDef | null>(null)

  const [milestoneSheetOpen, setMilestoneSheetOpen] = useState(false)
  const [editingMilestone, setEditingMilestone] = useState<MilestoneDef | null>(
    null,
  )
  const [deletingMilestone, setDeletingMilestone] = useState<MilestoneDef | null>(
    null,
  )

  const onFieldDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = fieldOrder.findIndex((f) => f.id === active.id)
    const newIdx = fieldOrder.findIndex((f) => f.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const next = arrayMove(fieldOrder, oldIdx, newIdx)
    setFieldOrder(next)
    reorderFields.mutate(next.map((f) => f.id))
  }

  const onMilestoneDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = milestoneOrder.findIndex((m) => m.id === active.id)
    const newIdx = milestoneOrder.findIndex((m) => m.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const next = arrayMove(milestoneOrder, oldIdx, newIdx)
    setMilestoneOrder(next)
    reorderMilestones.mutate(next.map((m) => m.id))
  }

  const templateName = template.data?.name ?? "Template"

  useTopbarCrumbs(
    useMemo(
      () => [
        { label: "Admin" },
        { label: "Templates", to: "/admin/templates" },
        { label: templateName },
      ],
      [templateName],
    ),
  )

  if (template.isLoading) {
    return (
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (template.isError) {
    const err = template.error
    const isNotFound = err instanceof ApiError && err.status === 404
    return (
      <div className="space-y-5">
        <header className="space-y-1">
          <h1 className="text-[20px] font-semibold tracking-[-0.01em]">
            {isNotFound ? "Template not found" : "Template"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isNotFound
              ? "The template you're looking for doesn't exist or has been archived."
              : "Couldn't load this template."}
          </p>
        </header>
        <Alert variant="destructive">
          <AlertTitle>{isNotFound ? "Not found" : "Load failed"}</AlertTitle>
          <AlertDescription>
            {err.detail}{" "}
            <Link to="/admin/templates" className="underline">
              Back to templates
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const t = template.data!
  const deptCode = codeFromList(depts.data, t.department_id)
  const clientCode = codeFromList(clients.data?.items, t.client_id)
  const disciplineCode = codeFromList(disciplines.data?.items, t.discipline_id)

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs">
          <Chip>{deptCode}</Chip>
          <ChevronRight aria-hidden className="size-3 text-muted-foreground" />
          <Chip>{clientCode}</Chip>
          <ChevronRight aria-hidden className="size-3 text-muted-foreground" />
          <Chip>{disciplineCode}</Chip>
        </div>
        <h1 className="text-[20px] font-semibold tracking-[-0.01em]">
          {t.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Last updated{" "}
          <time
            title={new Date(t.updated_at).toISOString()}
            dateTime={t.updated_at}
          >
            {new Date(t.updated_at).toLocaleDateString()}
          </time>
        </p>
      </header>

      <Panel
        icon={LayoutList}
        title="Custom fields"
        count={fields.data?.total ?? 0}
        action={
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              setEditingField(null)
              setFieldSheetOpen(true)
            }}
          >
            <Plus className="size-4" /> Add field
          </Button>
        }
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onFieldDragEnd}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[36px]"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-[180px]">Type</TableHead>
                <TableHead className="w-[110px]">Required</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-sm text-muted-foreground"
                  >
                    Loading…
                  </TableCell>
                </TableRow>
              ) : fieldOrder.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No fields defined yet.
                  </TableCell>
                </TableRow>
              ) : (
                <SortableContext
                  items={fieldOrder.map((f) => f.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {fieldOrder.map((f) => (
                    <SortableTableRow key={f.id} id={f.id}>
                      <TableCell
                        className="font-medium"
                        style={DENSITY_CELL_STYLE}
                      >
                        {f.name}
                      </TableCell>
                      <TableCell style={DENSITY_CELL_STYLE}>
                        <Badge tone={fieldTypeTone(f.field_type)}>
                          {fieldTypeLabel(f.field_type)}
                        </Badge>
                      </TableCell>
                      <TableCell style={DENSITY_CELL_STYLE}>
                        {f.required ? (
                          <Badge tone="rose">Required</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Optional
                          </span>
                        )}
                      </TableCell>
                      <TableCell style={DENSITY_CELL_STYLE}>
                        <EditDeleteRowMenu
                          label={`Actions for ${f.name}`}
                          onEdit={() => {
                            setEditingField(f)
                            setFieldSheetOpen(true)
                          }}
                          onDelete={() => setDeletingField(f)}
                        />
                      </TableCell>
                    </SortableTableRow>
                  ))}
                </SortableContext>
              )}
            </TableBody>
          </Table>
        </DndContext>
      </Panel>

      <Panel
        icon={Flag}
        title="Milestone set"
        count={milestones.data?.total ?? 0}
        action={
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              setEditingMilestone(null)
              setMilestoneSheetOpen(true)
            }}
          >
            <Plus className="size-4" /> Add milestone
          </Button>
        }
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onMilestoneDragEnd}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[36px]"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-[200px]">Direction</TableHead>
                <TableHead className="w-[160px]">Date model</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {milestones.isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-sm text-muted-foreground"
                  >
                    Loading…
                  </TableCell>
                </TableRow>
              ) : milestoneOrder.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No milestones defined yet.
                  </TableCell>
                </TableRow>
              ) : (
                <SortableContext
                  items={milestoneOrder.map((m) => m.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {milestoneOrder.map((m) => (
                    <SortableTableRow key={m.id} id={m.id}>
                      <TableCell
                        className="font-medium"
                        style={DENSITY_CELL_STYLE}
                      >
                        {m.name}
                      </TableCell>
                      <TableCell style={DENSITY_CELL_STYLE}>
                        <Badge tone={milestoneDirectionTone(m.direction)} dot>
                          {DIRECTION_LABEL[m.direction] ?? m.direction}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className="text-xs text-muted-foreground"
                        style={DENSITY_CELL_STYLE}
                      >
                        {DATE_MODEL_LABEL[m.date_model] ?? m.date_model}
                      </TableCell>
                      <TableCell style={DENSITY_CELL_STYLE}>
                        <EditDeleteRowMenu
                          label={`Actions for ${m.name}`}
                          onEdit={() => {
                            setEditingMilestone(m)
                            setMilestoneSheetOpen(true)
                          }}
                          onDelete={() => setDeletingMilestone(m)}
                        />
                      </TableCell>
                    </SortableTableRow>
                  ))}
                </SortableContext>
              )}
            </TableBody>
          </Table>
        </DndContext>
      </Panel>

      {tid && (
        <>
          <FieldDefSheet
            tid={tid}
            open={fieldSheetOpen}
            onOpenChange={setFieldSheetOpen}
            item={editingField}
            onSuccess={() =>
              toast.success(editingField ? "Field updated" : "Field created")
            }
          />
          <FieldDefDeleteDialog
            tid={tid}
            open={deletingField !== null}
            onOpenChange={(open) => !open && setDeletingField(null)}
            item={deletingField}
            onDeleted={() => toast.success("Field deleted")}
          />
          <MilestoneDefSheet
            tid={tid}
            open={milestoneSheetOpen}
            onOpenChange={setMilestoneSheetOpen}
            item={editingMilestone}
            onSuccess={() =>
              toast.success(
                editingMilestone ? "Milestone updated" : "Milestone created",
              )
            }
          />
          <MilestoneDefDeleteDialog
            tid={tid}
            open={deletingMilestone !== null}
            onOpenChange={(open) => !open && setDeletingMilestone(null)}
            item={deletingMilestone}
            onDeleted={() => toast.success("Milestone deleted")}
          />
        </>
      )}
    </div>
  )
}

// Both field rows and milestone rows expose the same Edit / Delete menu,
// so we share a small component rather than re-declaring the dropdown
// twice inline. Keeping it co-located in this file since it leans on
// table-row context and isn't reused elsewhere.
function EditDeleteRowMenu({
  label,
  onEdit,
  onDelete,
}: {
  label: string
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
