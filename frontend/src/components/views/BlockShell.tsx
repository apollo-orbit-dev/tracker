// Phase 7.3 — block chrome for custom view pages. Read mode: accent
// dot + title + content inside a Card, fully inert. Edit mode adds a
// dnd-kit grip (useSortable, same pattern as WidgetFrame), an
// InlineText title, and a kebab menu (Configure… / Duplicate /
// Remove).
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, MoreHorizontal } from "lucide-react"
import type { ReactNode } from "react"

import type { ViewBlock } from "@/api/views"
import { InlineText } from "@/components/InlineText"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Static strings so Tailwind sees every class at build time.
const ACCENT_DOT: Record<ViewBlock["accent"], string> = {
  indigo: "bg-indigo-500",
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  slate: "bg-slate-500",
}

type Props = {
  block: ViewBlock
  editing: boolean
  onConfigure: () => void
  onDuplicate: () => void
  onRemove: () => void
  onRename: (title: string) => void
  /** Drop the body's horizontal padding (header keeps its own) — for
   *  full-bleed content like the breakdown table (Phase 7.7). */
  noPad?: boolean
  children: ReactNode
}

export function BlockShell({
  block,
  editing,
  onConfigure,
  onDuplicate,
  onRemove,
  onRename,
  noPad = false,
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
  } = useSortable({ id: block.id, disabled: !editing })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }

  const widthClass =
    block.width === 4
      ? "md:col-span-4"
      : block.width === 2
        ? "md:col-span-2"
        : ""

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`relative gap-2 ${noPad ? "py-4" : "p-4"} ${widthClass}`}
      id={`block-${block.id}`}
    >
      <div className={`flex items-center gap-2 ${noPad ? "px-4" : ""}`}>
        {editing && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
            className="-ml-2 size-6 cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </Button>
        )}
        <span
          aria-hidden
          className={`size-2 shrink-0 rounded-full ${ACCENT_DOT[block.accent]}`}
        />
        {editing ? (
          <InlineText
            value={block.title ?? ""}
            maxLength={200}
            placeholder="Untitled block"
            onCommit={(next) => onRename(next.trim())}
            className="text-sm font-medium"
            inputClassName="w-full bg-transparent text-sm font-medium outline-none"
            ariaLabel="Rename block"
          />
        ) : (
          <span className="text-sm font-medium">
            {block.title ?? "Untitled block"}
          </span>
        )}
        {editing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Block actions"
                className="ml-auto size-6"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onConfigure}>
                Configure…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onRemove}>
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {children}
    </Card>
  )
}
