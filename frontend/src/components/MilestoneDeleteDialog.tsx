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
import { type Milestone, useMilestoneDelete } from "@/api/projects"

type Props = {
  pid: string
  open: boolean
  onOpenChange: (open: boolean) => void
  item: Milestone | null
  onDeleted?: () => void
}

export function MilestoneDeleteDialog({
  pid,
  open,
  onOpenChange,
  item,
  onDeleted,
}: Props) {
  const del = useMilestoneDelete(pid)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete milestone?</AlertDialogTitle>
          <AlertDialogDescription>
            {item ? (
              <>
                Delete <span className="font-mono">{item.name}</span>?
                The milestone is soft-deleted; planned and actual dates
                are preserved in the database but hidden from the UI.
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!item || del.isPending}
            onClick={(e) => {
              e.preventDefault()
              if (!item) return
              del.mutate(item.id, {
                onSuccess: () => {
                  onOpenChange(false)
                  onDeleted?.()
                },
              })
            }}
          >
            {del.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
