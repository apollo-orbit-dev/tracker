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
  type TaxonomyItem,
  type TaxonomyPath,
  useTaxonomyDelete,
} from "@/api/taxonomy"

type Props = {
  path: TaxonomyPath
  singular: string
  open: boolean
  onOpenChange: (open: boolean) => void
  item: TaxonomyItem | null
  onDeleted?: () => void
}

export function TaxonomyDeleteDialog({
  path,
  singular,
  open,
  onOpenChange,
  item,
  onDeleted,
}: Props) {
  const del = useTaxonomyDelete(path)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {singular.toLowerCase()}?</AlertDialogTitle>
          <AlertDialogDescription>
            {item ? (
              <>
                Archive{" "}
                <span className="font-mono">{item.code}</span> ({item.name})?
                It's soft-archived in the database and can be restored by an administrator.
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
