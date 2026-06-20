import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean
  action: "edit" | "delete"
  onOpenChange: (open: boolean) => void
  onThisOccurrence: () => void
  onEntireSeries: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EventScopeDialog({
  open,
  action,
  onOpenChange,
  onThisOccurrence,
  onEntireSeries,
}: Props) {
  const isDelete = action === "delete"
  const title = isDelete ? "Delete recurring event" : "Edit recurring event"
  const description = isDelete
    ? "Do you want to delete only this occurrence, or the entire series?"
    : "Do you want to edit only this occurrence, or the entire series?"

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="outline"
            onClick={onThisOccurrence}
          >
            This occurrence
          </AlertDialogAction>
          <AlertDialogAction
            variant={isDelete ? "destructive" : "default"}
            onClick={onEntireSeries}
          >
            Entire series
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
