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
import {
  type ProjectContact,
  useProjectContactDetach,
} from "@/api/project_contacts"

type Props = {
  pid: string
  open: boolean
  onOpenChange: (open: boolean) => void
  item: ProjectContact | null
  onDeleted?: () => void
}

export function ProjectContactDeleteDialog({
  pid,
  open,
  onOpenChange,
  item,
  onDeleted,
}: Props) {
  const detach = useProjectContactDetach(pid)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Detach contact?</AlertDialogTitle>
          <AlertDialogDescription>
            {item ? (
              <>
                Detach{" "}
                <span className="font-mono">{item.contact.name}</span> ({item.role})
                from this project? The contact record itself isn't deleted —
                only their attachment here.
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={detach.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={!item || detach.isPending}
            onClick={(e) => {
              e.preventDefault()
              if (!item) return
              detach.mutate(item.id, {
                onSuccess: () => {
                  onOpenChange(false)
                  onDeleted?.()
                },
              })
            }}
          >
            {detach.isPending ? "Detaching…" : "Detach"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
