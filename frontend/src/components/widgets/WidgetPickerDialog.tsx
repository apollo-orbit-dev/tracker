import { Check, Plus } from "lucide-react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { WIDGET_LIBRARY } from "@/components/widgets/WidgetLibrary"
import { ApiError } from "@/api/auth"
import { useWidgetAdd } from "@/api/dashboard_widgets"

type Props = {
  dashboardId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  activeTypes: Set<string>
}

export function WidgetPickerDialog({
  dashboardId,
  open,
  onOpenChange,
  activeTypes,
}: Props) {
  const add = useWidgetAdd(dashboardId)

  const onAdd = (widget_type: string) => {
    add.mutate(
      { widget_type },
      {
        onSuccess: () => toast.success("Widget added"),
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.detail : "Add failed"),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a widget</DialogTitle>
          <DialogDescription>
            Choose a widget to add to your dashboard. Widgets already on your
            dashboard are marked.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {WIDGET_LIBRARY.map((w) => {
            // Multi-instance widgets (e.g., field_aggregate) can be added
            // any number of times; single-instance widgets get the
            // "On dashboard" marker once added.
            const isActive = activeTypes.has(w.type)
            const showAddButton = w.multi || !isActive
            return (
              <li
                key={w.type}
                className="flex items-start justify-between gap-3 rounded-md border bg-background p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{w.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {w.description}
                  </div>
                </div>
                {showAddButton ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onAdd(w.type)}
                    disabled={add.isPending}
                  >
                    <Plus className="mr-1 size-3" />
                    Add
                  </Button>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-emerald-700">
                    <Check className="size-3" />
                    On dashboard
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
