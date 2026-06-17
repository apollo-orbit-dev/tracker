import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, RotateCcw } from "lucide-react"
import { useMemo } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  type FieldDefLite,
  type MilestoneDefLite,
  availableColumnsForTemplate,
  columnLabel,
  isBuiltIn,
} from "@/lib/view_columns"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  visible: string[]
  fieldDefs: FieldDefLite[]
  milestoneDefs: MilestoneDefLite[]
  onChange: (next: string[]) => void
  onReset: () => void
  savingState: "idle" | "saving" | "saved"
}

function SortableRow({
  columnKey,
  label,
  onUncheck,
}: {
  columnKey: string
  label: string
  onUncheck: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: columnKey })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded border bg-background px-2 py-1.5"
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        className="cursor-grab text-muted-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <Checkbox checked onCheckedChange={onUncheck} aria-label={`Hide ${label}`} />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function ColumnPickerSheet({
  open,
  onOpenChange,
  visible,
  fieldDefs,
  milestoneDefs,
  onChange,
  onReset,
  savingState,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const available = useMemo(
    () => availableColumnsForTemplate(fieldDefs, milestoneDefs),
    [fieldDefs, milestoneDefs],
  )
  const visibleSet = useMemo(() => new Set(visible), [visible])
  const hidden = available.filter((k) => !visibleSet.has(k))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over === null || active.id === over.id) return
    const oldIndex = visible.indexOf(String(active.id))
    const newIndex = visible.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    onChange(arrayMove(visible, oldIndex, newIndex))
  }

  function toggle(columnKey: string, checked: boolean) {
    if (checked) {
      onChange([...visible, columnKey])
    } else {
      onChange(visible.filter((k) => k !== columnKey))
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle>Columns</SheetTitle>
          <SheetDescription>
            Pick which columns to show. Drag visible columns to reorder.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Visible</h3>
              <span
                className="text-xs text-muted-foreground"
                aria-live="polite"
              >
                {savingState === "saving" && "Saving…"}
                {savingState === "saved" && "Saved"}
              </span>
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={visible}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-1">
                  {visible.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground">
                      No columns. Pick some below.
                    </p>
                  ) : (
                    visible.map((k) => (
                      <SortableRow
                        key={k}
                        columnKey={k}
                        label={columnLabel(k, fieldDefs, milestoneDefs)}
                        onUncheck={() => toggle(k, false)}
                      />
                    ))
                  )}
                </div>
              </SortableContext>
            </DndContext>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Hidden</h3>
            <div className="flex flex-col gap-1">
              {hidden.map((k) => (
                <label
                  key={k}
                  className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={false}
                    onCheckedChange={() => toggle(k, true)}
                    aria-label={`Show ${columnLabel(k, fieldDefs, milestoneDefs)}`}
                  />
                  <span className="text-sm">
                    {columnLabel(k, fieldDefs, milestoneDefs)}
                  </span>
                  {!isBuiltIn(k) && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {k.startsWith("milestone:") ? "milestone" : "custom"}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </section>

          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            className="self-start"
          >
            <RotateCcw className="mr-2 size-3.5" />
            Reset to defaults
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
