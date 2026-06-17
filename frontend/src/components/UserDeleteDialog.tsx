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
import { type UserItem, useUserDelete } from "@/api/users"

type Props = {
  item: UserItem | null
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}

export function UserDeleteDialog({ item, onOpenChange, onDeleted }: Props) {
  const del = useUserDelete()

  const onConfirm = () => {
    if (!item) return
    del.mutate(item.id, {
      onSuccess: () => {
        onOpenChange(false)
        onDeleted?.()
      },
    })
  }

  return (
    <AlertDialog open={item !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete user?</AlertDialogTitle>
          <AlertDialogDescription>
            {item && (
              <>
                Soft-delete <strong>{item.display_name}</strong> (
                {item.email}). The account will no longer be able to sign in.
                Existing role grants are preserved on the record but become
                inert.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={del.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {del.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
