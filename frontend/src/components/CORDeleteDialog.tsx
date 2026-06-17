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
import { type COR, useCORDelete } from "@/api/cors"

type Props = {
  pid: string
  open: boolean
  onOpenChange: (open: boolean) => void
  item: COR | null
  onDeleted?: () => void
}

export function CORDeleteDialog({
  pid,
  open,
  onOpenChange,
  item,
  onDeleted,
}: Props) {
  const del = useCORDelete(pid)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete COR?</AlertDialogTitle>
          <AlertDialogDescription>
            {item ? (
              <>
                Delete <span className="font-mono">{item.number}</span>?
                The COR is soft-deleted; the number can be reused later.
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
