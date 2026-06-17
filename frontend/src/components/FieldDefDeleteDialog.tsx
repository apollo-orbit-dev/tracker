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
import { type FieldDef, useFieldDefDelete } from "@/api/templates"

type Props = {
  tid: string
  open: boolean
  onOpenChange: (open: boolean) => void
  item: FieldDef | null
  onDeleted?: () => void
}

export function FieldDefDeleteDialog({
  tid,
  open,
  onOpenChange,
  item,
  onDeleted,
}: Props) {
  const del = useFieldDefDelete(tid)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete field?</AlertDialogTitle>
          <AlertDialogDescription>
            {item ? (
              <>
                Delete <span className="font-mono">{item.name}</span>?
                Existing project values for this field will be preserved
                in the database but hidden from the UI.
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
