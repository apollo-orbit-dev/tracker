// Phase 7.3 — confirm dialog for deleting a custom view. Mirrors
// ProjectDeleteDialog's AlertDialog pattern.
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

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  viewName: string
  onConfirm: () => void
  pending?: boolean
}

export function ViewDeleteDialog({
  open,
  onOpenChange,
  viewName,
  onConfirm,
  pending = false,
}: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete view?</AlertDialogTitle>
          <AlertDialogDescription>
            Delete <span className="font-medium">{viewName}</span> and all of
            its blocks? This only removes the view — none of the underlying
            project data is touched.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
          >
            {pending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
