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
import { type Contact, useContactDelete } from "@/api/contacts"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: Contact | null
  onDeleted?: () => void
}

export function ContactDeleteDialog({
  open,
  onOpenChange,
  item,
  onDeleted,
}: Props) {
  const del = useContactDelete()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive contact?</AlertDialogTitle>
          <AlertDialogDescription>
            {item ? (
              <>
                Archive <span className="font-mono">{item.name}</span>?
                Soft-archived; the email becomes re-usable for a new
                contact record.
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
