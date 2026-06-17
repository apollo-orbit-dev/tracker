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
import { type Project, useProjectDelete } from "@/api/projects"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: Project | null
  onDeleted?: () => void
}

export function ProjectDeleteDialog({
  open,
  onOpenChange,
  item,
  onDeleted,
}: Props) {
  const del = useProjectDelete()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete project?</AlertDialogTitle>
          <AlertDialogDescription>
            {item ? (
              <>
                Delete <span className="font-mono">{item.project_number}</span>{" "}
                ({item.title})? The project is soft-deleted; milestones
                and history are preserved.
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
