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
import { type RosterEntry, useRoleRevoke } from "@/api/roster"

type Props = {
  deptId: string
  entry: RosterEntry | null
  onOpenChange: (open: boolean) => void
  onRevoked?: () => void
}

const ROLE_LABEL: Record<string, string> = {
  department_manager: "Department Manager",
  project_editor: "Project Editor",
  viewer: "Viewer",
}

export function RosterRevokeDialog({
  deptId,
  entry,
  onOpenChange,
  onRevoked,
}: Props) {
  const revoke = useRoleRevoke(deptId)

  const onConfirm = () => {
    if (!entry) return
    revoke.mutate(entry.user_role_id, {
      onSuccess: () => {
        onOpenChange(false)
        onRevoked?.()
      },
    })
  }

  return (
    <AlertDialog open={entry !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke role?</AlertDialogTitle>
          <AlertDialogDescription>
            {entry && (
              <>
                Remove <strong>{entry.display_name}</strong>'s{" "}
                <strong>{ROLE_LABEL[entry.role_id] ?? entry.role_id}</strong>{" "}
                role from this department. They'll lose access immediately;
                their grants in other departments are unaffected.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={revoke.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={revoke.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {revoke.isPending ? "Revoking…" : "Revoke"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
