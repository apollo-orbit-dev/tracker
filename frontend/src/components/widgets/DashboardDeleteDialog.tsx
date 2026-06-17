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
import type { Dashboard } from "@/api/dashboards"

type Props = {
  dashboard: Dashboard | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  pending?: boolean
}

export function DashboardDeleteDialog({
  dashboard,
  onOpenChange,
  onConfirm,
  pending,
}: Props) {
  return (
    <AlertDialog open={dashboard !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete dashboard?</AlertDialogTitle>
          <AlertDialogDescription>
            {dashboard && (
              <>
                Permanently delete <strong>{dashboard.name}</strong> and all
                of its widgets. The widgets on other dashboards are
                unaffected. This cannot be undone.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
