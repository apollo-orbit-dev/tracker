import { useEffect, useState } from "react"
import { toast } from "sonner"

import { ApiError } from "@/api/auth"
import {
  useProjectAccessGrant,
  useProjectAccessList,
  useProjectAccessRevoke,
} from "@/api/project_access"
import { useUserPicker } from "@/api/roster"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { UserCombobox } from "@/components/UserCombobox"

type Props = {
  pid: string
  projectTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProjectAccessSheet({
  pid,
  projectTitle,
  open,
  onOpenChange,
}: Props) {
  const list = useProjectAccessList(open ? pid : "")
  const picker = useUserPicker()
  const grant = useProjectAccessGrant(pid)
  const revoke = useProjectAccessRevoke(pid)

  const [selectedUserId, setSelectedUserId] = useState("")

  useEffect(() => {
    if (!open) setSelectedUserId("")
  }, [open])

  const grants = list.data?.items ?? []
  const grantedIds = new Set(grants.map((g) => g.user_id))
  // Hide users who already have a direct grant from the picker so the
  // admin can't easily try to double-grant (the backend 409s anyway).
  const pickerUsers = (picker.data?.items ?? []).filter(
    (u) => !grantedIds.has(u.id),
  )

  const onGrant = () => {
    if (!selectedUserId) return
    grant.mutate(selectedUserId, {
      onSuccess: () => {
        toast.success("Access granted")
        setSelectedUserId("")
      },
      onError: (e) => toast.error(e.detail),
    })
  }

  const onRevoke = (userId: string) => {
    revoke.mutate(userId, {
      onSuccess: () => toast.success("Access revoked"),
      onError: (e) => toast.error(e.detail),
    })
  }

  const loadError = list.error instanceof ApiError ? list.error : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Manage access — {projectTitle}</SheetTitle>
          <SheetDescription>
            Users granted direct read-only access to this project beyond
            department-scope membership. Use sparingly — most cross-team
            visibility should be handled through department or org viewer
            roles.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-4">
          {loadError && (
            <Alert variant="destructive">
              <AlertTitle>Couldn't load access list</AlertTitle>
              <AlertDescription>{loadError.detail}</AlertDescription>
            </Alert>
          )}

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Current access</h3>
            {list.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : grants.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No direct grants yet.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {grants.map((g) => (
                  <li
                    key={g.user_id}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {g.display_name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {g.email}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Granted {new Date(g.granted_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRevoke(g.user_id)}
                      disabled={revoke.isPending}
                      aria-label={`Revoke access for ${g.display_name}`}
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Grant access</h3>
            <div className="flex flex-col gap-2">
              <UserCombobox
                users={pickerUsers}
                value={selectedUserId}
                onChange={setSelectedUserId}
                isLoading={picker.isLoading}
              />
              <Button
                onClick={onGrant}
                disabled={!selectedUserId || grant.isPending}
              >
                {grant.isPending ? "Granting…" : "Grant access"}
              </Button>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
