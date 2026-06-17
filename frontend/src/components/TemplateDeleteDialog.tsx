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
import { type Template, useTemplateDelete } from "@/api/templates"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: Template | null
  onDeleted?: () => void
}

export function TemplateDeleteDialog({
  open,
  onOpenChange,
  item,
  onDeleted,
}: Props) {
  const del = useTemplateDelete()

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive template?</AlertDialogTitle>
          <AlertDialogDescription>
            {item ? (
              <>
                Archive <span className="font-mono">{item.name}</span>? The
                template is soft-archived; field and milestone definitions
                under it are no longer visible.
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
            {del.isPending ? "Archiving…" : "Archive"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
