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
import { type MilestoneDef, useMilestoneDefDelete } from "@/api/templates"

type Props = {
  tid: string
  open: boolean
  onOpenChange: (open: boolean) => void
  item: MilestoneDef | null
  onDeleted?: () => void
}

export function MilestoneDefDeleteDialog({
  tid,
  open,
  onOpenChange,
  item,
  onDeleted,
}: Props) {
  const del = useMilestoneDefDelete(tid)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete milestone?</AlertDialogTitle>
          <AlertDialogDescription>
            {item ? (
              <>
                Delete <span className="font-mono">{item.name}</span>?
                Existing milestones on projects keep their data; only the
                template definition is soft-deleted.
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
