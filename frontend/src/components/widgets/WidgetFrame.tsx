// Wraps each widget on the dashboard. In view mode it just renders the
// widget itself. In customize mode it overlays a drag handle, a width
// toggle, a remove "×", and (for configurable widgets) a Configure
// pencil so the user can reorder/resize/remove/configure.
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Maximize2, Minimize2, Settings, X } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"

type Props = {
  id: string
  width: number
  customizing: boolean
  configurable: boolean
  onRemove: () => void
  onConfigure?: () => void
  onToggleWidth: () => void
  children: ReactNode
}

export function WidgetFrame({
  id,
  width,
  customizing,
  configurable,
  onRemove,
  onConfigure,
  onToggleWidth,
  children,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Fully hide the source while dragging; the parent's <DragOverlay>
    // is rendering a clean ghost of the widget that follows the cursor.
    opacity: isDragging ? 0 : undefined,
  }

  const className =
    "relative " + (width === 2 ? "md:col-span-2" : "")

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={className}
      id={`widget-${id}`}
    >
      {customizing && (
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
            className="cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleWidth}
            aria-label={width === 2 ? "Shrink to half width" : "Expand to full width"}
          >
            {width === 2 ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </Button>
          {/* Every widget can be renamed; configurable widgets get
              additional controls inside the sheet. */}
          {onConfigure && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onConfigure}
              aria-label={configurable ? "Configure widget" : "Rename widget"}
            >
              <Settings className="size-4" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label="Remove widget"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}
      {children}
    </div>
  )
}
